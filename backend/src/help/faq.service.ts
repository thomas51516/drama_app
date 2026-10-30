import { Injectable, NotFoundException } from '@nestjs/common';
import { CatalogCacheService } from '../cache/catalog-cache.service.js';
import { AuditService } from '../admin/audit/audit.service.js';
import { type SupportedLanguage } from '../common/i18n/accept-language.js';
import { type AuthenticatedAdmin } from '../common/request-context.js';
import { type FaqEntry, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type CreateFaqEntryDto,
  type FaqEntryDto,
  type FaqPublicDto,
  HELP_CATEGORIES,
  type LocalizedTextDto,
  type UpdateFaqEntryDto,
} from './dto/help.dto.js';

export const FAQ_CACHE_TTL_SECONDS = 300;
export const faqCacheKey = (lang: string): string => `cache:v1:help:faq:${lang}`;

/** Libellés des catégories du centre d'aide, par langue. */
export const CATEGORY_TITLES: Record<string, Record<SupportedLanguage, string>> = {
  account: { fr: 'Compte', en: 'Account', es: 'Cuenta', pt: 'Conta' },
  coins: { fr: 'Pièces', en: 'Coins', es: 'Monedas', pt: 'Moedas' },
  vip: { fr: 'VIP', en: 'VIP', es: 'VIP', pt: 'VIP' },
  playback: { fr: 'Lecture', en: 'Playback', es: 'Reproducción', pt: 'Reprodução' },
  payment: { fr: 'Paiement', en: 'Payment', es: 'Pago', pt: 'Pagamento' },
  content: { fr: 'Contenu', en: 'Content', es: 'Contenido', pt: 'Conteúdo' },
  other: { fr: 'Autre', en: 'Other', es: 'Otro', pt: 'Outro' },
};

/** Texte dans la langue demandée, sinon français, sinon première valeur disponible. */
export function localize(value: unknown, lang: SupportedLanguage): string {
  const texts = (value ?? {}) as Partial<Record<string, string>>;
  return texts[lang] ?? texts.fr ?? Object.values(texts).find((v) => !!v) ?? '';
}

/**
 * FAQ du centre d'aide (M-53, S06-BE-02) : entrées par catégorie avec textes `{ fr, en, es, pt }`
 * (repli fr). Lecture publique mise en cache 5 min par langue, gestion EDITOR / SUPPORT / ADMIN.
 */
@Injectable()
export class FaqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CatalogCacheService,
    private readonly audit: AuditService,
  ) {}

  publicFaq(lang: SupportedLanguage): Promise<FaqPublicDto> {
    return this.cache.remember(faqCacheKey(lang), FAQ_CACHE_TTL_SECONDS, async () => {
      const entries = await this.prisma.faqEntry.findMany({
        where: { isPublished: true },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      return FaqService.group(entries, lang);
    });
  }

  static group(entries: FaqEntry[], lang: SupportedLanguage): FaqPublicDto {
    const byCategory = new Map<string, FaqEntry[]>();
    for (const e of entries) {
      const list = byCategory.get(e.category) ?? [];
      list.push(e);
      byCategory.set(e.category, list);
    }
    const order = [...HELP_CATEGORIES, ...byCategory.keys()];
    const seen = new Set<string>();
    const categories = [];
    for (const key of order) {
      if (seen.has(key) || !byCategory.has(key)) continue;
      seen.add(key);
      categories.push({
        key,
        title: CATEGORY_TITLES[key]?.[lang] ?? CATEGORY_TITLES[key]?.fr ?? key,
        entries: byCategory.get(key)!.map((e) => ({
          id: e.id,
          question: localize(e.question, lang),
          answer: localize(e.answer, lang),
        })),
      });
    }
    return { categories };
  }

  async list(): Promise<FaqEntryDto[]> {
    const entries = await this.prisma.faqEntry.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    return entries.map(toFaqEntryDto);
  }

  async create(dto: CreateFaqEntryDto, admin: AuthenticatedAdmin, ip?: string) {
    const position =
      dto.position ??
      ((await this.prisma.faqEntry.aggregate({ _max: { position: true } }))._max.position ?? -1) +
        1;
    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.faqEntry.create({
        data: {
          category: dto.category,
          question: toJson(dto.question),
          answer: toJson(dto.answer),
          position,
          isPublished: dto.isPublished ?? true,
        },
      });
      await this.audit.record(
        {
          actor: admin,
          action: 'faq.create',
          targetType: 'faq_entry',
          targetId: entry.id,
          newValue: { category: entry.category, question: dto.question.fr, position },
          ip,
        },
        tx,
      );
      return entry;
    });
    await this.invalidate();
    return toFaqEntryDto(created);
  }

  async update(id: string, dto: UpdateFaqEntryDto, admin: AuthenticatedAdmin, ip?: string) {
    const before = await this.findOrThrow(id);
    const data: Prisma.FaqEntryUpdateInput = {};
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.question !== undefined) data.question = toJson(dto.question);
    if (dto.answer !== undefined) data.answer = toJson(dto.answer);
    if (dto.position !== undefined) data.position = dto.position;
    if (dto.isPublished !== undefined) data.isPublished = dto.isPublished;
    const updated = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.faqEntry.update({ where: { id }, data });
      await this.audit.record(
        {
          actor: admin,
          action: 'faq.update',
          targetType: 'faq_entry',
          targetId: id,
          oldValue: snapshot(before),
          newValue: snapshot(entry),
          ip,
        },
        tx,
      );
      return entry;
    });
    await this.invalidate();
    return toFaqEntryDto(updated);
  }

  async remove(id: string, admin: AuthenticatedAdmin, ip?: string): Promise<void> {
    const before = await this.findOrThrow(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.faqEntry.delete({ where: { id } });
      await this.audit.record(
        {
          actor: admin,
          action: 'faq.delete',
          targetType: 'faq_entry',
          targetId: id,
          oldValue: snapshot(before),
          ip,
        },
        tx,
      );
    });
    await this.invalidate();
  }

  /** Nouvel ordre global : les identifiants fournis prennent les positions 0..n-1, les autres suivent. */
  async reorder(ids: string[], admin: AuthenticatedAdmin, ip?: string): Promise<FaqEntryDto[]> {
    const all = await this.prisma.faqEntry.findMany({
      select: { id: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
    const known = new Set(all.map((e) => e.id));
    const ordered = [...new Set(ids.filter((id) => known.has(id)))];
    const rest = all.map((e) => e.id).filter((id) => !ordered.includes(id));
    const finalOrder = [...ordered, ...rest];
    await this.prisma.$transaction(async (tx) => {
      for (const [position, id] of finalOrder.entries()) {
        await tx.faqEntry.update({ where: { id }, data: { position } });
      }
      await this.audit.record(
        {
          actor: admin,
          action: 'faq.reorder',
          targetType: 'faq_entry',
          newValue: { ids: finalOrder },
          ip,
        },
        tx,
      );
    });
    await this.invalidate();
    return this.list();
  }

  private invalidate(): Promise<number> {
    return this.cache.invalidateByPrefix('help:faq:');
  }

  private async findOrThrow(id: string): Promise<FaqEntry> {
    const entry = await this.prisma.faqEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException({ code: 'FAQ_ENTRY_NOT_FOUND', message: 'FAQ entry not found' });
    }
    return entry;
  }
}

function toJson(text: LocalizedTextDto): Prisma.InputJsonObject {
  const out: Record<string, string> = { fr: text.fr };
  for (const lang of ['en', 'es', 'pt'] as const) if (text[lang]) out[lang] = text[lang];
  return out;
}

function snapshot(e: FaqEntry) {
  return {
    category: e.category,
    position: e.position,
    isPublished: e.isPublished,
    question: e.question,
  };
}

export function toFaqEntryDto(e: FaqEntry): FaqEntryDto {
  return {
    id: e.id,
    category: e.category,
    question: e.question as unknown as LocalizedTextDto,
    answer: e.answer as unknown as LocalizedTextDto,
    position: e.position,
    isPublished: e.isPublished,
    updatedAt: e.updatedAt.toISOString(),
  };
}

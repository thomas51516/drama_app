import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { HmacMediaUrlSigner } from './hmac-media-url-signer.js';
import { MEDIA_URL_SIGNER, type MediaUrlSigner } from './media-url-signer.js';
import { PlainMediaUrlSigner } from './plain-media-url-signer.js';

/** Signature des URLs de lecture (S04-BE-02) : `MEDIA_SIGNER=plain|hmac`. */
@Global()
@Module({
  providers: [
    {
      provide: MEDIA_URL_SIGNER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): MediaUrlSigner => {
        const { mode, key, ttlSeconds } = config.mediaSigner;
        return mode === 'hmac'
          ? new HmacMediaUrlSigner(key ?? '', ttlSeconds)
          : new PlainMediaUrlSigner(ttlSeconds);
      },
    },
  ],
  exports: [MEDIA_URL_SIGNER],
})
export class MediaModule {}

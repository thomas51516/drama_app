import { type Request } from 'express';
import { type UserType } from '../generated/prisma/client.js';

export interface AuthenticatedUser {
  id: string;
  type: UserType;
}

export type RequestWithContext = Request & {
  user?: AuthenticatedUser;
  requestId?: string;
};

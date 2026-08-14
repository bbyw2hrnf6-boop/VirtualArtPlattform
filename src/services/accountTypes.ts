export type AccountSession = {
  uid: string;
  email?: string;
  displayName?: string;
  nickname?: string;
  avatarSrc?: string;
  avatarPath?: string;
  newsletterSubscribed?: boolean;
  isAnonymous: boolean;
  emailVerified: boolean;
  providers: string[];
};

export const isVerifiedAccount = (
  session: AccountSession | null | undefined,
) => Boolean(session && !session.isAnonymous && session.emailVerified);

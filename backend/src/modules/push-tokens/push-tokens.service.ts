import { prisma } from "../../lib/prisma";

/**
 * A token belongs to whichever user most recently registered it — if the
 * same phone is later used by a different logged-in user, the token
 * moves with them rather than staying attached to the old account.
 */
export async function upsertToken(userId: string, token: string, platform: string) {
  await prisma.deviceToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform },
  });
}

export async function deleteToken(token: string) {
  await prisma.deviceToken.deleteMany({ where: { token } });
}

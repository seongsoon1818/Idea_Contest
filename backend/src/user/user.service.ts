import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import type { Principal } from "../common/http.js";
import { invalid, revoked } from "../common/errors.js";
import { objectInput } from "../common/input.js";
import { lockViewer } from "../auth/session-access.js";
import { passwordInput } from "../auth/credentials.js";
import { AuthService } from "../auth/auth.service.js";
import { selectable } from "../catalog/academic.js";
import { profileInput } from "./profile.input.js";
import {
  userSelect,
  userView,
  profileSelect,
  profileView,
} from "./user.view.js";

@Injectable()
export class UserService {
  constructor(
    private readonly db: PrismaService,
    private readonly auth: AuthService,
  ) {}
  async account(viewer: Principal) {
    const user = await this.db.user.findUnique({
      where: { id: viewer.userId },
      select: userSelect,
    });
    if (!user) throw revoked();
    return userView(user);
  }
  async profile(viewer: Principal) {
    const user = await this.db.user.findUnique({
      where: { id: viewer.userId },
      select: profileSelect,
    });
    if (!user) throw revoked();
    return profileView(user);
  }
  async save(viewer: Principal, raw: unknown, full: boolean) {
    const patch = profileInput(raw, full),
      userId = viewer.userId;
    return this.db.$transaction(async (tx) => {
      await lockViewer(tx, viewer);
      const current = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: profileSelect,
      });
      if (
        patch.grade !== undefined ||
        patch.units !== undefined ||
        patch.interests !== undefined
      ) {
        const grade = patch.grade ?? current.profile?.grade;
        if (!grade) invalid("grade", "학년을 선택하세요.");
        const units =
          patch.units ??
          current.academicUnits.map((u) => ({
            slot: u.slot,
            academicUnitId: u.academicUnit.id,
          }));
        const codes =
          patch.interests ?? current.topics.map((t) => t.topic.code);
        if (
          !units.some((u) => u.slot === 1) ||
          (grade === "YEAR_1"
            ? units.length !== 1
            : !units.some((u) => u.slot === 2))
        )
          invalid(
            "academicUnits",
            "1학년은 1번 소속만, 그 외 학년은 1·2번 소속이 필수입니다.",
          );
        if (!codes.length || codes.length > 4)
          invalid("interestCodes", "관심 분야를 1~4개 선택하세요.");
        const activeUnits = await tx.academicUnit.findMany({
          where: {
            isActive: true,
            id: { in: units.map((u) => u.academicUnitId) },
          },
          select: { id: true, kind: true },
        });
        for (const [i, u] of units.entries()) {
          const unit = activeUnits.find((r) => r.id === u.academicUnitId);
          if (!unit || !selectable(grade, u.slot, unit.kind))
            invalid(
              "academicUnits[" + i + "].academicUnitId",
              "선택할 수 없는 소속입니다.",
            );
        }
        const topics = await tx.topic.findMany({
          where: { code: { in: codes }, isActive: true },
          select: { id: true, code: true },
        });
        if (codes.some((code) => !topics.some((t) => t.code === code)))
          invalid(
            "interestCodes",
            "비활성 또는 존재하지 않는 관심 분야입니다.",
          );
        const completedAt = current.profile?.completedAt ?? new Date();
        await tx.userProfile.upsert({
          where: { userId },
          create: { userId, grade, completedAt },
          update: { grade, completedAt, updatedAt: new Date() },
        });
        if (patch.units) {
          await tx.userAcademicUnit.deleteMany({ where: { userId } });
          await tx.userAcademicUnit.createMany({
            data: units.map((u) => ({ ...u, userId })),
          });
        }
        if (patch.interests) {
          await tx.userTopic.deleteMany({ where: { userId } });
          await tx.userTopic.createMany({
            data: topics.map((t) => ({ userId, topicId: t.id })),
          });
        }
      }
      if (patch.name !== undefined)
        await tx.user.update({
          where: { id: userId },
          data: { name: patch.name },
        });
      const updated = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: profileSelect,
      });
      return { user: userView(updated), profile: profileView(updated) };
    });
  }

  async withdraw(viewer: Principal, raw: unknown) {
    const b = objectInput(raw, ["confirmation", "currentPassword"]);
    if (b.confirmation !== "WITHDRAW")
      invalid("confirmation", "WITHDRAW 확인값이 필요합니다.");
    return this.auth.withReauthentication(
      viewer,
      passwordInput(b.currentPassword, "currentPassword"),
      async (tx) => {
        const userId = viewer.userId;
        if (
          !(await tx.noticeSummary.count({ where: { reviewedBy: userId } }))
        ) {
          // v2.2 FKs cascade personal rows, but never delete bookmarked public content.
          await tx.user.delete({ where: { id: userId } });
        } else {
          // Preserve only the reviewer identity referenced by historical public summaries.
          await tx.deadlineReminder.deleteMany({ where: { userId } });
          await tx.webPushSubscription.deleteMany({ where: { userId } });
          await tx.userNotificationSettings.deleteMany({ where: { userId } });
          await tx.userSession.deleteMany({ where: { userId } });
          await tx.userNoticeBookmark.deleteMany({ where: { userId } });
          await tx.userProgramBookmark.deleteMany({ where: { userId } });
          await tx.userAcademicUnit.deleteMany({ where: { userId } });
          await tx.userTopic.deleteMany({ where: { userId } });
          await tx.userProfile.deleteMany({ where: { userId } });
          await tx.user.update({
            where: { id: userId },
            data: {
              name: "탈퇴한 사용자",
              loginId: "~" + userId.toString(36),
              passwordHash: "!",
              status: "WITHDRAWN",
              role: "MEMBER",
              lastLoginAt: null,
              withdrawnAt: new Date(),
            },
          });
        }
        return { withdrawn: true };
      },
    );
  }
}

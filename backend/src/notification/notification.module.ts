import { Module } from "@nestjs/common";
import { NotificationController } from "./notification.controller.js";
import { NotificationWorker } from "./notification.worker.js";
import { InboxService } from "./inbox.service.js";
import { SubscriptionsService } from "./subscriptions.service.js";
import { PushTransport } from "./push.js";
@Module({
  controllers: [NotificationController],
  providers: [
    NotificationWorker,
    InboxService,
    SubscriptionsService,
    PushTransport,
  ],
})
export class NotificationModule {}

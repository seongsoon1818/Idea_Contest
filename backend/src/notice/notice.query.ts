import { contentQuery, contentQueryKeys } from "../content/content.query.js";
export const queryKeys = contentQueryKeys("noticeCategory");
export const noticeQuery = (p: Record<string, string>) =>
  contentQuery(p, "noticeCategory");

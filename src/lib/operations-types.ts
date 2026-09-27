export const operationChecks = {
  containers: { name: "运行服务", description: "网站、入口、数据库和搜索服务" },
  origin: { name: "源站访问", description: "网站及其依赖的响应情况" },
  public: { name: "公网访问", description: "从服务器检查公开网站入口" },
  disk: { name: "磁盘空间", description: "应用和文章存储的可用空间" },
  backup_age: { name: "备份时效", description: "最近一组完整备份是否及时生成" },
  backup_job: { name: "备份任务", description: "最近一次备份是否成功" },
} as const;

export type OperationCheckId = keyof typeof operationChecks;
export type OperationStatus = "ok" | "pending" | "firing" | "disabled";
export type OperationsReport = {
  status: "ok" | "degraded" | "stale" | "unavailable";
  checkedAt: string | null;
  checks: {
    id: OperationCheckId;
    status: OperationStatus;
    failures: number;
    since: number;
  }[];
  events: { check: OperationCheckId; status: OperationStatus; at: string }[];
};

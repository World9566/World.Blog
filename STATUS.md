# 独立状态站与故障跳转

公开状态站：`https://status.world9566.online`。主站：`https://www.world9566.online`。

## 部署结构

- 管理中心「运行状态」使用现有管理员接口，展示容器、源站、公网、磁盘、备份时效和任务结果，仅管理员可读。
- 公开状态站由 Cloudflare Worker 和 D1 提供，不依赖 Ubuntu、Docker、PostgreSQL 或 Tunnel。访客无需登录，页面和资源没有外部字体或脚本依赖。
- Worker 每分钟检查首页、文章列表和带关键词的搜索页面，保存公开访问结果。它不连接管理员接口，也不公开服务器地址、磁盘、备份、用户或原始错误内容。
- 启用主站 Worker 路由后，页面导航遇到源站故障会临时跳转到状态子域。正常请求直接转发，不查询状态数据库。

状态子域必须绑定 Worker Custom Domain，**不要把它也配置成同一台 Ubuntu 上的 Tunnel 路由**。否则整机故障时状态页会一起失效。Cloudflare 的 [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) 承载状态站，[Routes](https://developers.cloudflare.com/workers/configuration/routing/routes/) 位于主站现有代理入口之前。

## 首次上线

### 1. 发布主站与启用内部巡检

先推送应用代码，等待主仓库的 `check`、`check-status`、`publish`、`deploy` 成功。三个被监控页面新增了用于确认完整页面已开始呈现的标记；先发布应用可避免新监控把旧版本误判为故障。

如果服务器此前只启用了每日备份，在 SSH 中以原部署用户执行：

```bash
cd ~/apps/world-blog
bash scripts/ops/setup-operations.sh --install
systemctl list-timers world-blog-backup.timer world-blog-monitor.timer --no-pager
```

该命令保留已有 `.env.ops`，启用备份和巡检定时器，并立即进行一次巡检。现有 `BACKUP_KEEP_DAYS=7`、`BACKUP_KEEP_MIN=3`、`BACKUP_AUTO_PRUNE=1` 不变。管理中心 TAB 随应用发布可用，但没有巡检结果时会显示「暂未获得运行状态」。

### 2. 创建状态数据库

在本地应用仓库中操作，需要 Node.js 24 和可管理 `world9566.online` 的 Cloudflare 账号：

```powershell
cd status
npm ci
npx wrangler login
npx wrangler d1 create world-blog-status
```

将返回的 `database_id` 填入 `status/wrangler.jsonc`，替换全零占位符。数据库 ID 是资源标识，不是访问密钥。不要把账号 token、登录缓存或真实 `.dev.vars` 提交进 Git。

应用 D1 迁移并发布：

```powershell
npm run db:remote
npm run deploy
```

首次配置只绑定 `status.world9566.online`，不会接管主站流量。Wrangler 根据 Custom Domain 配置管理对应域名入口；如该子域已有冲突的 DNS 或 Tunnel 路由，先核对并移除该子域的旧入口，保留主站 `www` 配置。

仓库的应用 Actions 不自动发布 Worker。后续改动 `status/` 时，仍在该目录执行数据库迁移和 `npm run deploy`。迁移命令只应用未执行的迁移。

### 3. 验证公开状态站

在 Cloudflare 的 Worker 设置中确认：

- Custom Domain 为 `status.world9566.online`，TLS 已生效。
- D1 绑定名为 `DB`，数据库为 `world-blog-status`。
- Cron Trigger 为 `* * * * *`，每分钟执行。
- `MAIN_ORIGIN=https://www.world9566.online`、`STATUS_ORIGIN=https://status.world9566.online`。

访问状态页和 `/api/status`。首次结果可能尚未到达，此时应显示「待更新」，不能显示虚构的正常历史。等待定时任务生效后，确认三项检查的 `checkedAt` 持续推进，并且实际网站、文章和搜索均可访问。[Cron Trigger 配置变更需要传播时间](https://developers.cloudflare.com/workers/configuration/cron-triggers/)，首次发布不应马上以没有数据判定失败。

不要给状态页加登录墙、整站 JS Challenge 或 Cache Everything。若现有安全规则按整个域名匹配，需核对它们是否影响状态子域和公开只读 `/api/status`。无需关闭主站 WAF 或限流。持续出现异常但人工访问正常时，检查 Cloudflare 安全事件及 Worker 日志，确认监控请求没有被拦截。

### 4. 启用主站故障跳转

**确认状态页、API 和定时检查正常后再执行本步。** 在 `status/wrangler.jsonc` 的 `routes` 中保留状态 Custom Domain，追加主站路由：

```json
"routes": [
  { "pattern": "status.world9566.online", "custom_domain": true },
  { "pattern": "www.world9566.online/*", "zone_name": "world9566.online" }
]
```

然后在 `status/` 目录执行：

```powershell
npm run deploy
```

保留现有 `www` 的代理 DNS 与 Tunnel 配置。不要给主站添加 Worker Custom Domain，也不要配置 `*.world9566.online/*` 通配路由。如果只在控制台临时添加 Route，下次 Wrangler 发布可能按本地配置覆盖它，因此最终应同步到上述配置文件。

主站 Route 建议选择 **Fail open**：Worker 额度耗尽时放行到原入口，避免状态服务成为新的阻断点。Worker 代码也对未处理异常启用直通。免费计划的请求和 CPU 配额仍适用；主站 Route 匹配的请求也消耗 Worker 用量，需在控制台观察使用情况。额度与故障模式见 [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)。

上线后检查首页、文章、搜索、GitHub 登录、个人中心、管理中心，以及一个不存在的页面。不要通过停止生产服务器来测试跳转；仓库测试已覆盖模拟源站断网与 5xx 的处理路径。需要实际演练时先在测试域名和测试源站验证。

## 访客看到的行为

| 情况                                                        | 行为                                                                        |
| ----------------------------------------------------------- | --------------------------------------------------------------------------- |
| 正常访问                                                    | 保留原响应，包括 Cookie、缓存和 RSC 响应                                    |
| HTML 文档导航收到源站 5xx、网络错误，或等待响应头超过 20 秒 | 返回不可缓存的 302，跳转到 `https://status.world9566.online/?from=main`     |
| API、OAuth 回调、POST 等写入、静态资源、RSC 或预取请求失败  | 保留原错误，避免将 HTML 状态页当作接口结果                                  |
| 401、403、404、429                                          | 保留原状态，不视为整站故障                                                  |
| 已打开的页面进入 Next.js 错误界面                           | 每 15 秒核对公开状态；有 5 分钟内确认的故障才跳转，否则保留重试和状态页入口 |
| Worker 数据库不可用或监控停止更新                           | 公开页显示「待更新」，不会把未知状态显示为正常                              |

重定向目标固定，不附带原请求参数、登录 token 或 Cookie，并抑制来源 URL。状态页不会自动跳回主站，避免循环；访客可点击「访问网站」重试。正常已打开页面不会后台轮询状态接口，也不会被强制跳转。

边缘跳转要求浏览器能连接 Cloudflare。Cloudflare 自身故障、DNS 故障或访客完全断网时无法保证自动跳转。状态站与主站独立于 Ubuntu，但仍共享 Cloudflare 这一供应商故障范围。域名根 `world9566.online` 若使用跳转到 `www` 的既有规则，继续保留；当前 Worker 只接管明确配置的 `www` 主域。

## 状态与历史口径

- 探测超时为 8 秒，要求 HTTP 200、HTML 和对应页面标记，避免把登录页、拦截页或错误页误报为正常。
- 连续 3 次失败建立故障记录；首次失败先显示「正在确认」。已确认故障连续 2 次成功后记录恢复。
- 超过 5 分钟没有检查结果显示「待更新」，监控中断不等同于网站正常或故障。
- 保存最近 30 天的每日检查次数与通过次数，以北京时间划分日期。「检查通过率」是成功采样占比，不是精确按秒计算的在线率，也不代表每个地区的网络质量。
- 无采样的日期显示灰色；过去日期采样不足全天 80% 且没有已知失败，也显示「数据不足」。当天显示截至当前的检查结果。
- 展示最近 30 条故障与恢复记录。已恢复记录保留 90 天；未恢复记录一直保留，即使开始时间超过 90 天。
- 重复或迟到的同一分钟采样不重复计数。公开接口只输出三项访问检查和故障时间，不返回内部运维报告。

## 本地验证

主项目测试包含状态数据库迁移、故障确认和恢复、过期数据、保留策略、响应隔离及输出转义：

```powershell
docker compose exec -T web pnpm test
docker compose exec -T web pnpm typecheck
docker compose exec -T web pnpm admin:check
docker compose exec -T web pnpm content:check
```

独立 Worker 的本地数据库与预览：

```powershell
cd status
npm ci
npm run db:local
npm run dev -- --ip 127.0.0.1 --port 8787 --var MAIN_ORIGIN:http://127.0.0.1:3000
```

预览地址为 `http://127.0.0.1:8787`。本地变量将探测目标设为开发博客；不会访问或修改生产数据库。`wrangler dev --test-scheduled` 提供本地定时任务测试入口，使用 Wrangler 输出的地址触发一次检查即可。未经采集的预览保持「待更新」。本地数据位于被忽略的 `status/.wrangler/`。

在 `status/` 中执行 `npm run check` 可用真实 workerd、D1 和静态资源绑定验证入口、迁移、定时探测、正常转发与故障跳转，探测目标为临时本地服务。执行 `npx wrangler deploy --dry-run --outdir ../tmp/status-worker-build` 只构建，不部署。CI 的 `check-status` 执行这两项检查，不需要 Cloudflare 凭据，不会更改域名或云端数据。

## 回退

若主站接入 Worker 后出现异常，先从 `routes` 删除 `www.world9566.online/*` 并重新部署，或紧急在控制台解除该条 Route。保留主站原有 Tunnel DNS，原访问路径即可恢复；同步修改仓库配置以免下次重新加回。可以继续保留独立状态站和数据库，不需要改动主站 Docker 服务或删除历史记录。

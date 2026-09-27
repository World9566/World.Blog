# 公开运营与稳定性

本阶段使用生产 Nginx 限流、本地备份和本地告警记录。不配置异地备份，不发送外部通知。代码发布后限流随 gateway 生效；定时备份和巡检需要在服务器初始化一次。

## 公开读取限流

规则位于 `deploy/nginx.conf.template`，采用按来源 IP 共享的内存计数，跨 Nginx worker 生效，不为每个请求写数据库。

| 范围                       | 持续速率    | 短时额外突发 | 超限响应               |
| -------------------------- | ----------- | ------------ | ---------------------- |
| GET/HEAD `/search`         | 120 次/分钟 | 60 次        | HTTP 429，中文重试页面 |
| GET/HEAD `/api/articles/*` | 600 次/分钟 | 120 次       | HTTP 429，JSON 提示    |

这是允许短时突发、按持续速率恢复额度的限制，不是固定分钟窗口。正常请求不排队，没有人为增加等待；关键词、文章 ID 变化不会重置同一 IP 的额度。两类读取使用独立额度。搜索页的专题与分页仍在浏览器本地切换，不产生这些请求。写操作仍走现有账号限流，不占读取额度。

响应含 `Retry-After: 30` 和 `Cache-Control: private, no-store`。浏览器客户端也能处理 Cloudflare 返回的非 JSON 429。Cloudflare 的 200 次/10 秒规则是另外一层保护，两层计数独立；校园或公司出口若发生误拦，可结合网关 429 日志调整对应速率与突发值。单独访问开发服务 `localhost:3000` 不经过生产网关，因此没有这层入口限流。

Nginx 仅通过现有 loopback Tunnel 入口接收公网请求，使用 Cloudflare 提供的 `CF-Connecting-IP` 并覆盖转发给应用的 `X-Real-IP`。不要将网关端口改为公网监听，也不要让不可信代理任意写入这个头。

带 Cloudflare 来源头的 `/api/health`、`/api/content/refresh` 请求在网关返回 404。本机/Docker 健康检查仍有效；内容状态 GET 与刷新 POST 均要求现有 `CONTENT_REFRESH_TOKEN`。不要在 Cloudflare 放开内部接口用于外部监控，公网巡检使用首页。

## 服务器首次启用

先正常 push 并确认应用 Actions 部署成功，再以**部署用户**进入应用目录。服务器需要 Bash、curl、flock、timeout、tar、openssl、df 及可用的 Docker 权限。Ubuntu 上 curl 位于 `curl` 软件包，flock 位于 `util-linux`。

```bash
cd ~/apps/world-blog

# 生成当前用户、当前目录对应的 service/timer，保留已有私有配置
bash scripts/ops/setup-operations.sh

# 首次备份和恢复演练。输出的是随机独立库，演练结束自动移除
backup=$(bash scripts/ops/backup.sh)
bash scripts/ops/restore-drill.sh "$backup"

# 手动生成第一份状态；检查 JSON 后再启用定时任务
bash scripts/ops/monitor.sh
cat .deploy/world-blog/operations/status.json

# 安装并启用每天备份、每分钟巡检。需要 sudo 写 systemd unit
bash scripts/ops/setup-operations.sh --install
```

项目名不是 `world-blog` 时，报告目录中的项目名随 `.env.production` 的 `COMPOSE_PROJECT_NAME` 变化。systemd unit 名称固定为 `world-blog-*`；同机部署多个博客时应独立命名 unit。

`setup-operations.sh` 不执行备份或恢复，不更改 `.env.production`，也不会在应用发布时自动运行。日常发布更新脚本后无需重新安装 unit；如果修改了 service/timer 本身，需再次执行 `--install`。

```bash
systemctl list-timers world-blog-backup.timer world-blog-monitor.timer
journalctl -u world-blog-monitor.service -u world-blog-backup.service --since today
```

## 部署占锁与拉取超时

应用发布、内容发布、备份和恢复共用 `.deploy/<项目名>/operation.lock`。看到 `Another operation is active` 时，先检查服务器上的维护进程；Actions 已取消或超时，不代表远端 SSH 启动的进程已经退出。不要在旧进程仍运行时直接删除锁。

应用部署对整个并行镜像拉取设置 15 分钟上限，随后最多等待 15 秒强制终止拉取客户端。超时发生在停止网站和执行迁移之前，会返回失败并清理部署锁、临时 Compose 配置；已运行的版本继续服务。deploy 作业的总时限为 30 分钟，为后续备份、迁移和健康检查留出时间。镜像源和拉取并发方式沿用原配置，不自动重试。此限制只覆盖镜像拉取阶段，不代替其他阶段的故障排查。

旧版本遗留任务需要先确认 PID、所属部署、当前阶段和子进程，结束对应任务，确认它及子进程均退出后，才能清理残留的空锁目录。不要终止 Docker 守护进程或运行中的网站容器。

## 本地备份与保留

每天服务器时区 04:30 后 15 分钟内执行备份。部署正在进行时会推迟，失败后 systemd 每 15 分钟重试。备份和内容/应用发布共用维护锁，内容快照不会在打包中途被切换或清理。

每一组 `backups/<项目名>/<时间>-<随机标识>.dump*` 包含：

- PostgreSQL custom 格式归档及 SHA-256 校验。
- `.meta`：数据库对应的成功应用版本、迁移数量和当前内容版本。
- `.env`：私有生产配置副本，包括恢复 OAuth 加密数据需要的认证密钥。
- `.content.tar.gz`：当前内容目录，包含文章、图片、专题、版本历史元数据，排除 Git 工作树指针。尚未初始化内容时没有这个文件。
- 配置、元数据和内容归档各自的校验文件；`.complete` 在整组成功后才生成。

这些文件默认仅部署用户可读写。备份未加密，也不上传；本地备份不能覆盖整台服务器或磁盘丢失的情况。搜索索引可从内容重新生成，不备份容器缓存。

修改服务器 `.env.ops` 中的保留设置：默认 14 天，并且至少保留最近 7 组完整备份；**自动删除默认关闭**。

```bash
# 只预览哪些旧备份符合删除条件
bash scripts/ops/backup-prune.sh

# 确认预览后清理这些备份
bash scripts/ops/backup-prune.sh --apply
```

需要随每日备份清理时，设置 `BACKUP_AUTO_PRUNE=1`。清理仅在本次备份成功后执行，且只处理本项目目录里符合命名规则的完整备份组，不处理旧格式、失败残留或其他文件。遇到锁竞争会保留全部文件。

## 恢复演练与真实恢复

`restore-drill.sh` 使用随机 `blog_drill_<标识>` 新库，验证还原、迁移数量及用户/评论/收藏表可读，并校验内容归档。最终删除的只有该次演练创建的独立库；不改当前数据库、环境文件、内容链接或运行版本。测试结果保存在 `.deploy/<项目名>/restore-drill-result`，建议每次结构性变更后演练一次。

真实恢复仍使用：

```bash
bash scripts/ops/restore.sh backups/world-blog/<备份>.dump --into blog_recovered
```

已有同名数据库时会拒绝覆盖。按照 README 的恢复步骤验证新库、选择 `.meta` 对应的应用镜像与认证密钥后再切换。若应用镜像已从仓库删除，需要从对应应用提交重新构建。

内容归档可先解压到一个**新建的私有暂存目录**进行检查，不能直接覆盖当前 `releases/current`。正常情况下，优先从内容仓库重新发布 `.meta` 的内容 SHA；需要从归档救援时，停止入口和应用，恢复到该 SHA 对应的新版本目录并设置正确只读权限，再切换 current、按匹配应用版本重建搜索索引和检查站点。归档中的 `.git` 不存在，后续 Git 内容发布仍需要内容仓库或其备份。

## 本地告警与管理员接口

巡检检查：四个容器状态、源站深度健康、公网首页、应用/内容目录所在磁盘的使用率与可用空间、最近完整备份时间、最近备份任务结果。

- 默认连续失败 3 次才进入 `firing`，单次失败为 `pending`；恢复后记一条恢复事件。
- 状态不变时不重复写告警。最多保留最近 200 条事件，不记录凭据、IP、请求参数、用户数据或原始错误响应。
- 默认磁盘使用率达到 85% 或可用空间小于 1 GiB 时告警；备份超过 30 小时告警。独立挂载的 Docker 数据盘应另行纳入主机磁盘监控。
- `.env.ops` 可调整阈值。`MONITOR_PUBLIC_ENABLED=0` 关闭服务器到公网首页的检查。该检查能检测部分 Tunnel 故障，但不代表所有访客地区的网络质量。
- 巡检器依赖服务器运行；整机离线时无法主动产生新记录。读取接口会将超过 5 分钟未更新的报告标记为 `stale`，未初始化或损坏则为 `unavailable`，不会误报健康。

管理员登录后可读取：

```text
GET /api/admin/operations
```

返回 `status`、`checkedAt`、`checks` 和 `events`。访客为 401，普通用户为 403，响应始终为私有且不可缓存。网页容器只读挂载经过整理的报告目录，无法读取原始运维状态或备份。

管理中心的「运行状态」TAB 展示六项检查、最近检查时间、告警与恢复事件。初次进入显示骨架屏，随后每 30 秒刷新一次，页面隐藏时暂停请求，也可手动刷新。报告超过 5 分钟会明确显示过期；未初始化和请求失败均不会显示为健康。状态页只读取报告，不触发备份、恢复或服务器维护操作。没有接入邮件或 Webhook 通知。

若此前只启用了每日备份，需执行本文件开头的 `bash scripts/ops/setup-operations.sh --install` 启用每分钟巡检。它会保留已有 `.env.ops`，包括已配置的 7 天保留、至少 3 组和自动清理策略。

独立公开状态站、主站入口和故障跳转见 [STATUS.md](STATUS.md)。公开站仅保存访问检查结果，不读取管理员报告、服务器磁盘信息或备份文件。

参考：[Nginx 限流模块](https://nginx.org/en/docs/http/ngx_http_limit_req_module.html)。

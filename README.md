# Blog

World 是 world9566 的技术博客，基于 Next.js、MDX、PostgreSQL 和 Meilisearch。支持文章与专题、全文搜索、代码复制、链接分享、RSS 和站点地图。

读者通过 GitHub 登录后，可以评论、回复、点赞、收藏和管理个人资料。管理员可以管理用户、审核评论并查看操作记录。文章使用 MDX 编写在独立内容仓库中，推送即经 SSH 以原子切换发布，无需重建应用镜像；生产服务由 Docker Compose 管理，并通过 Cloudflare Tunnel 接入。

## 环境

| 组件            | 版本 / 用途                                       |
| --------------- | ------------------------------------------------- |
| Node.js         | 24.21.0 LTS，基础镜像使用 digest 固定             |
| pnpm            | 11.19.0                                           |
| Next.js / React | 16.3.5 / 19.3.0                                   |
| PostgreSQL      | 18.6                                              |
| Meilisearch     | 1.53.2                                            |
| Prisma          | CLI、Client 和 PostgreSQL adapter 统一使用 7.10.0 |
| Better Auth     | 1.7.5，GitHub OAuth 与数据库会话                  |

只需 Docker Desktop 使用 Linux 容器模式。Node.js、pnpm 和应用依赖均在容器内管理；Windows 无需安装项目依赖。使用 VS Code 的 Dev Containers 扩展可获得容器内的 TypeScript 和依赖解析。

## 首次启动

在项目目录的 PowerShell 中执行：

```powershell
.\scripts\init-env.ps1
docker compose build web
docker compose up -d --wait
```

初始化脚本创建随机数据库密码、搜索密钥和认证密钥，并写入被 Git 忽略的 `.env`。重复运行会保留现有配置。首次启动会按 `pnpm-lock.yaml` 安装依赖、生成 Prisma 客户端，并通过 `prisma migrate deploy` 应用仓库中的迁移，需要访问包仓库。

访问地址：

- 博客：http://localhost:3000
- 服务健康检查：http://localhost:3000/api/health
- PostgreSQL：`127.0.0.1:5432`，数据库和用户名均为 `blog`，密码见 `.env`。
- Meilisearch：`http://127.0.0.1:7700`，业务 API 需要 `.env` 中的 `MEILI_MASTER_KEY`。

所有宿主机端口仅绑定 `127.0.0.1`。Meilisearch 使用要求密钥的 production 模式，其根路径不作为管理界面使用。

如端口冲突，修改 `.env` 中的 `WEB_PORT`、`POSTGRES_PORT`、`MEILI_PORT`。同时调整本机使用的 `BETTER_AUTH_URL`、`DATABASE_URL` 和 `MEILI_HOST` 中的对应端口；Compose 内的容器地址会单独设置。

## 日常开发

```powershell
# 启动已有环境
docker compose up -d --wait

# 查看服务状态和日志
docker compose ps
docker compose logs --tail=100 -f web

# 进入容器终端
docker compose exec web sh

# 类型检查、Prisma 配置检查、真实服务读写检查
docker compose exec web pnpm test
docker compose exec web pnpm typecheck
docker compose exec web pnpm content:check
docker compose exec web pnpm auth:check
docker compose exec web pnpm community:check
docker compose exec web pnpm db:validate
docker compose exec web pnpm env:check

# 暂停环境，保留数据
docker compose stop

# 恢复环境
docker compose up -d --wait
```

编辑 `content/posts/*.mdx` 或 `src/` 下文件即可热更新。开发模式使用 Webpack 文件轮询，兼容 Windows 绑定目录。文章变动会重新校验内容，并同步搜索索引；错误只记录在服务日志中。

添加依赖也在容器中执行，例如 `docker compose exec web pnpm add <package>`，随后将 `package.json` 和 `pnpm-lock.yaml` 一起提交。

VS Code 可通过命令面板执行 `Dev Containers: Reopen in Container`。请先初始化 `.env`。关闭 VS Code 不会自动停止这些容器，按需使用 `docker compose stop`。

## 构建验证

使用一次性容器及其独立的构建输出，避免覆盖正在运行的开发服务缓存：

```powershell
docker compose run --rm --no-deps --env NODE_ENV=production --volume /app/build web sh -c 'NEXT_DIST_DIR=build/next pnpm build'
docker compose exec web pnpm typecheck
```

这一步验证生产构建。`Dockerfile.dev` 和 `compose.yaml` 用于本地开发；`Dockerfile` 和 `compose.prod.yaml` 用于正式部署，通过现有 Cloudflare Tunnel 接入 HTTPS。详见下方“生产部署”。

GitHub Actions 叠加 `compose.ci.yaml`，使用 `Dockerfile.dev` 的 `ci` 阶段：构建时安装锁定依赖并将源码复制给容器内的 `node` 用户，运行时不挂载宿主机源码，也不开放测试服务端口。这避免 Linux runner 与容器用户 UID 不同导致生成文件失败。CI 使用临时测试凭据，失败时在清理前输出容器日志与健康检查记录。

## 数据与配置

- `postgres_data` 和 `meili_data` 是独立命名卷，重建应用容器会保留服务数据。
- `node_modules`、`next_cache` 和 `pnpm_store` 位于 Docker 命名卷，避免 Windows 与 Linux 原生依赖混用。
- `docker compose down` 保留命名卷；`docker compose down -v` 会删除包括数据库在内的卷数据，日常停机使用 `stop`。
- 数据卷提供持久化，正式上线前还需配置异地备份和恢复验证。
- `.env.example` 可提交，真实 `.env` 不提交、不打包进镜像。
- Prisma schema 已包含用户、账号关联、会话、评论、点赞、收藏、管理操作记录、验证数据和限流表。开发新模型时使用 `db:migrate` 生成迁移，重新启动使用 `db:deploy` 应用已有迁移。
- GitHub OAuth 配置方法见下节。凭据未填写时仍可阅读文章，登录页会显示暂不可用。
- 站名、作者、GitHub 和专题配置在 `src/lib/site.ts`。当前站名为 `World`，作者为 `world9566`。
- 正式域名确定后设置 `SITE_URL=https://你的域名`，用于 canonical、RSS、站点地图与文章结构化数据。未设置时使用本地地址并禁止搜索引擎索引；它不会自动创建公网部署。

## GitHub 登录与账号管理

1. 在 [GitHub OAuth Apps](https://github.com/settings/developers) 创建 OAuth App。
2. 本地开发填写：Application name 为 `World Blog Local`，Homepage URL 为 `http://localhost:3000`，Authorization callback URL 为 `http://localhost:3000/api/auth/callback/github`。
3. 将 Client ID 与生成的 Client Secret 分别填入 `.env` 的 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`，保留 `BETTER_AUTH_URL=http://localhost:3000`。
4. 运行 `docker compose up -d --wait` 重新加载容器环境，打开 `http://localhost:3000/login` 完成 GitHub 授权。

开发登录统一使用 `localhost`。`127.0.0.1` 与 `localhost` 的 Cookie 不互通，OAuth App 回调地址、`BETTER_AUTH_URL` 和实际登录域名需要一致。上线时更换对应配置，并重新构建、部署应用。

GitHub 登录申请 `read:user` 和 `user:email`，不申请仓库权限。首次登录创建普通用户，不会将第一个注册者自动设为管理员。个人中心支持编辑昵称与简介、查看关联账号和登录设备、退出其他设备及当前账号。头像来自 GitHub，邮箱仅在自己的个人中心显示。

会话有效期为 7 天，活跃会话按一天间隔续期。Cookie 使用 HttpOnly、SameSite=Lax；HTTPS 地址启用 Secure。OAuth token 加密后存入数据库。保留 `BETTER_AUTH_SECRET`，更换它会使既有登录凭据失效，并影响已保存的 OAuth token 解密。

### 设置管理员或停用账号

用户至少登录一次后，在其个人中心查看 GitHub 数字 ID。服务端使用该不可随昵称变更的账号 ID 定位已注册用户：

```powershell
# 将明确指定的 GitHub 账号设为管理员
docker compose exec web pnpm user:access --github-id <GitHub数字ID> --role admin --reason '初始化站长管理权限'

# 恢复为普通用户
docker compose exec web pnpm user:access --github-id <GitHub数字ID> --role user

# 停用 / 恢复账号
docker compose exec web pnpm user:access --github-id <GitHub数字ID> --ban
docker compose exec web pnpm user:access --github-id <GitHub数字ID> --unban
```

上述操作发生实际变更时，会撤销目标用户的现有会话，需要重新登录。只有能操作服务器或容器的站长可运行这些命令；也可以由现有管理员在 `/admin` 管理其他用户。命令支持 `--reason` 指定原因，未填写时记录默认维护说明。网页和命令均禁止停用或降级最后一位正常使用的管理员。

### 认证验证

`pnpm auth:check` 仅针对本地地址运行，通过独立临时账号检查真实 HTTP 接口、资料隔离、跨站请求拦截、会话撤销、禁用状态和 OAuth 授权链接；结束时按精确 ID 删除测试账号及其关联数据。它不代替真实 GitHub 授权回调验证。

参考：[GitHub OAuth App 创建说明](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)、[Better Auth GitHub 接入](https://better-auth.com/docs/authentication/github)。

## 评论与阅读记录

- 文章底部可以点赞、收藏、发表评论及回复。访客可阅读讨论，登录后可参与。
- 评论为纯文本，保留换行，最多 2000 个字符。支持主评论及一级回复，回复按发布时间排列并分页加载。
- 用户可以删除自己的评论，正文会被清空；已有回复会保留在“这条评论已删除”的位置下。删除后不再接受新回复。
- 个人中心的“我的阅读”提供收藏和自己的评论记录，支持分页及取消收藏。
- 评论、点赞和收藏通过 MDX 元数据中的永久 `id` 关联。更改文章 slug 不会丢失互动记录；撤下或改为草稿后，这些记录不再对读者显示，重新发布相同 ID 可恢复关联。
- 每个账号每分钟最多发布 5 条评论或回复、变更 60 次点赞或收藏、删除 30 次评论。限流记录保存在数据库；重复设置点赞或收藏不会生成重复记录。
- 评论发布携带请求 ID，网络重试沿用该 ID，避免重复发布。错误时保留输入，界面提供重试与反馈。

`pnpm community:check` 使用独立临时账号验证真实接口的访问权限、输入边界、并发写入、回复归属、删除、分页、限流和停用状态。完成后按精确用户 ID 清理测试数据，不需要真实 GitHub 授权。

## 管理中心

管理员登录后可从个人中心进入 `/admin`。普通用户访问会返回个人中心，访客会进入登录页。

- **用户管理**：按昵称、GitHub 用户名或数字 ID 搜索，筛选账号状态，停用 / 恢复账号，授予 / 撤销管理员权限。后台不允许修改自己的角色或停用状态。
- **评论审核**：采用发布后审核，新评论立即公开并进入待审核列表。支持搜索、状态筛选和分页，以及通过、隐藏、恢复和删除。
- 隐藏主评论会一并隐藏回复，文章计数、直接回复接口和个人评论记录保持一致；恢复主评论后，未被单独隐藏的回复重新出现。已隐藏或已删除的主评论不接受新回复。
- 删除清空该条正文且不能恢复，已有回复和原有可见范围保持不变。删除隐藏的主评论后，整个讨论继续隐藏。恢复回复也不会自动恢复其所属主评论。
- **操作记录**：每次实际变更记录操作人、来源、目标、原因、时间及变更前后的状态。记录不复制评论正文、邮箱或登录凭据；后台不能修改或删除操作记录。
- 网页写操作必须填写 2 到 500 个字符的单行原因。每位管理员每分钟最多 60 次管理请求。权限、会话和账号状态在事务获得锁后重新检查，权限变更会撤销目标用户全部旧会话。

```powershell
docker compose exec web pnpm admin:check
```

该检查仅对本地开发地址运行，使用独立临时账号验证权限、跨站请求、审核可见性、删除、分页、操作记录和并发权限撤销。最后一位管理员的数据库场景只在运行前没有其他管理员时执行，避免修改真实账号。结束后按精确 ID 清理测试账号、评论和相关操作记录。

## 写作与搜索

文章存放在独立的[内容仓库](https://github.com/World9566/world-blog-content)（本地开发时 clone 到 `content/`，该路径被忽略）：
```powershell
git clone https://github.com/World9566/world-blog-content content
```

在其 `posts/` 下新建使用小写字母、数字和 ASCII hyphen 命名的 `.mdx` 文件：

```mdx
---
id: "post_unique_name"
slug: "my-first-article"
title: "文章标题"
description: "用一两句话概括读者能从文章中得到什么。"
publishedAt: "2026-09-15"
topic: "engineering"
tags: ["Docker", "实践"]
cover: "layers"
featured: false
draft: true
---

正文从这里开始。

## 第一个小节

正文支持表格、代码高亮和 MDX 组件。

<Callout title="提示">需要强调的阅读提示。</Callout>
```

- `id` 是文章的永久标识，应保持稳定；`slug` 决定 `/articles/slug` 链接，发布后修改会改变网址。
- `draft` 必须显式填写。只有 `draft: false` 且发布日期不晚于北京时间当天的文章会进入页面、搜索和 RSS。日期到期的未来文章会在次日自动出现，无需重新发布。
- 日期必须加引号。修改文章时可添加 `updatedAt: "2026-09-16"`，不能早于发布日期。
- 专题选 `engineering`、`web` 或 `fundamentals`；封面图形选 `layers`、`branches`、`brackets` 或 `search`。
- 页面提供一级标题，正文使用 `##` 和 `###` 自动生成目录；支持 GFM 表格、列表及代码围栏。
- MDX 可以执行代码，只允许可信站长在内容仓库中编写。访客评论采用独立的纯文本输入与渲染方式。
- 内容仓库已有的文章是起始内容，可编辑、删除或设为草稿。

文章不在构建时编译进镜像，而是由运行中的应用从内容目录实时读取并缓存；MDX 编译产物按（源码哈希 + 应用版本）落盘缓存，应用发布后自动失效。开发服务在启动和文章变更时自动同步 Meilisearch；搜索服务暂时不可用时，页面会改用当前已发布内容进行本地匹配。站点只在服务端访问搜索密钥。索引通过临时索引构建后整体交换，删除或转为草稿的文章会从新索引中移除。

可手动执行以下命令。校验失败会阻止生产构建与内容发布；搜索同步包含构建临时索引和整体交换两个阶段，发布脚本会把两阶段拆开，夹在内容切换前后：

```powershell
docker compose exec web pnpm content:validate
docker compose exec web pnpm content:release-check
docker compose exec web pnpm search:sync
```

`pnpm content:check` 会对正在运行的站点进行公开路由、搜索、输入处理、RSS、站点地图和索引一致性检查，期望结果来自对内容目录的实时校验。修改文章后，等待开发服务完成热编译与搜索同步再执行。`pnpm content:release-check` 额外对每篇文章执行完整 MDX 编译，是内容发布前的权威检查。

## 文件布局

```text
content/                  内容仓库的本地 clone（开发用，被忽略）
src/app/                  页面、RSS、站点地图与健康接口
src/components/           导航、文章卡片、目录与阅读交互
src/lib/                  内容运行时加载、MDX 编译、搜索与站点配置
src/mdx-components.tsx     MDX 组件入口
prisma/                   Prisma schema 与数据库迁移
scripts/                  内容校验、搜索同步、发布与环境检查
tests/                    内容、账号和社区输入边界测试
.devcontainer/            VS Code 容器开发配置
compose.yaml              本地服务编排
compose.ci.yaml           CI 测试环境覆盖配置
Dockerfile.dev            Node.js 开发环境
compose.prod.yaml         生产服务编排
Dockerfile                生产应用与维护镜像
deploy/                   代理配置与备份定时器模板
.github/workflows/        检查、镜像发布与自动部署
```

## 仓库提交范围

提交源码、依赖锁文件、数据库迁移、测试、容器配置和维护脚本。测试是 CI 检查的一部分，迁移是初始化及升级数据库的必要文件。文章与内容历史属于独立的内容仓库，本仓库的 `content/` 只是本地开发 clone，不提交。

真实 `.env`、密钥、数据库备份、日志、依赖目录、构建产物、生成代码、编辑器配置与本地设计记录均被忽略。只提交 `.env.example` 和 `.env.production.example` 两个空凭据模板；正式域名和公开作者署名可以保留在仓库中。

在首次推送前创建一个空 GitHub 仓库，然后配置自己的远程地址：

```bash
git remote add origin <你的GitHub仓库地址>
git push -u origin main
```

## 生产部署

公开域名为 `https://www.world9566.online`。宿主机 cloudflared 将该域名转发到 `http://localhost:8080`，Compose 的入口仅绑定 `127.0.0.1:8080`。应用、PostgreSQL 与 Meilisearch 不发布宿主机端口。生产应用运行构建后的镜像，不挂载整个源码目录；文章不打包进镜像，而是由应用从 `~/apps/world-blog-content/releases` 只读挂载的内容目录实时读取。

1. 将部署文件放入服务器部署用户的 `~/apps/world-blog`。提供的 Docker 安装脚本适用于 Ubuntu 22.04，已有 Docker 时仅检查版本。

   ```bash
   bash scripts/ops/install-docker.sh
   bash scripts/ops/init-env.sh https://www.world9566.online ghcr.nju.edu.cn/你的账号/你的仓库
   ```

   初始化脚本会创建同级的 `~/apps/world-blog-content`（内容发布目录）并写入 `CONTENT_ROOT` 和 `CONTENT_REFRESH_TOKEN`。该目录在应用目录之外，应用归档解压不会覆盖它。
2. 在服务器私有 `.env.production` 中填写生产 GitHub OAuth 凭据。生产 OAuth App 的 Homepage URL 为 `https://www.world9566.online`，回调为 `https://www.world9566.online/api/auth/callback/github`。其余密钥由初始化脚本生成，不要用开发密钥覆盖。
3. 在 GitHub 仓库配置变量 `SITE_URL=https://www.world9566.online`。推送 `main` 后，检查通过才会构建并发布 GHCR 镜像。域名参与应用构建，换域名需要重建镜像。
4. 在 GitHub 创建 `production` environment，并配置 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_SSH_KEY`、`DEPLOY_KNOWN_HOSTS` 四个 Secrets。主机填写 Actions 能访问的 IPv4 或主机名，SSH 使用 22 端口；known_hosts 内容应通过可信连接核验。
5. 服务器需要能够以部署账号运行 Docker，或已有 `sudo -n docker` 权限。镜像包须在 GitHub 的 Package settings 中设为 Public：加速源只匿名代理公开镜像，公开后服务器经南大公益加速源 `ghcr.nju.edu.cn` 拉取，无需登录。
6. 准备就绪后设置仓库变量 `DEPLOY_ENABLED=true`，后续 main 提交会自动传输部署文件并发布。该变量未启用时只检查和发布镜像。

基础服务的固定版本也会复制到同一 GHCR 包，生产服务器可以只连接加速源。CI 仍将镜像发布到 `ghcr.io`；服务器拉取时把镜像仓库域名中的 `ghcr.io` 替换为南大公益加速源 `ghcr.nju.edu.cn` 即可（该源仅匿名代理公开镜像，无需 docker login）。手动发布和检查：

```bash
bash scripts/ops/deploy.sh <完整40位提交SHA>
curl --fail http://127.0.0.1:8080/api/health
```

发布会短暂停止入口和应用，先备份，再执行数据库迁移、发布文章内容并检查健康状态。相同迁移版本下可通过 `bash scripts/ops/rollback.sh` 回退上一应用；新增或失败的迁移需要人工恢复或修复，不能只回退应用镜像。

### 发布文章

文章在[独立内容仓库](https://github.com/World9566/world-blog-content)中编写，push 到其 `main` 即发布：内容仓库自己的 Actions 检出本仓库的校验管线做元数据校验和全量 MDX 编译（PR 上即可快速失败），然后打一个 `git bundle` 通过 SSH 送进服务器执行 `bash ~/apps/world-blog/scripts/ops/content-deploy.sh <完整40位提交SHA>`。整个过程不停站、不迁移数据库、不重建镜像，通常在一分钟内完成。

内容发布的过程：服务器从 bundle 初始化或更新对象库 `~/apps/world-blog-content/repo`（服务器不访问 GitHub，内容仓库可以是私有仓库），用 `git worktree` 把该提交检出为 `releases/<SHA>`，用当前应用镜像做完整编译校验，构建搜索临时索引，全部通过后原子切换 `current` 符号链接并通知应用热刷新，再交换搜索索引、对真实站点做冒烟检查。校验或索引失败时站点保持原状；切换后的失败会连同搜索索引一起回滚。历史内容版本保留在 `releases/` 中（当前、上一版本与最近 3 个），回滚内容即用旧 SHA 重新发布。中断的发布会留下 journal，下次执行时自动恢复或清理。首次完整部署前服务器没有内容发布，`deploy.sh` 会先发布一个空内容版本，站点随后由内容仓库的首次发布填充。

运维命令通过 `common.sh` 加载私有配置和当前成功版本：

```bash
source scripts/ops/common.sh
dc ps
dc logs --tail=100 web gateway
dc run --rm --no-deps ops pnpm user:access --github-id <GitHub数字ID> --role admin
```

生产数据库独立，站长须先在正式站点登录，再初始化管理员。Cloudflare 不应缓存登录、个人中心、管理页面和认证接口，也不要给带会话 Cookie 的响应配置 Cache Everything。

### 备份与恢复

```bash
bash scripts/ops/backup.sh
bash scripts/ops/restore.sh backups/world-blog/<备份>.dump --into blog_recovered
```

备份包含数据库归档、校验文件、版本元数据和 `.dump.env` 私有配置副本，权限为 `600`。配置副本含真实凭据，需要加密保存到服务器之外；`BETTER_AUTH_SECRET` 是恢复已有 OAuth 加密记录的必要信息。脚本不自动上传或删除历史备份。

恢复先写入一个不存在的新库，保留当前数据库。验证数据后，停止入口和应用，另外备份当前库；将 `.env.production` 的 `POSTGRES_DB` 切到新库并恢复备份对应的认证密钥，保留当前数据库密码和有效 OAuth 配置。把 `.deploy/world-blog/current-release` 设置为备份元数据中的有效版本，重新加载 `common.sh`，检查维护镜像配置、同步搜索，再启动 web 和 gateway。不要直接向恢复库运行新版本迁移。

`deploy/world-blog-backup.service` 和 `.timer` 提供每日备份模板，启用前检查其中的用户、路径、sudo 权限和服务器时区。CI 使用 `scripts/check-production.sh` 在独立容器中验证生产启动、HTTP 与备份恢复，不操作正式数据库。

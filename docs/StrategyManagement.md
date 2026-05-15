# 策略管理与分享模块开发记录

本文记录策略管理功能的实现：导入导出、可见性管理、版本对比与策略市场。

## 1. 功能概述

在原有策略工作台（模板浏览、代码编辑、参数管理、版本历史）基础上，补齐策略管理闭环：

- **策略导入导出**：将策略（含全量版本和代码）导出为 JSON 文件，支持跨环境迁移。
- **可见性管理**：策略设为公开后可出现在策略市场供浏览与复用。
- **版本回测对比**：对同一策略不同版本的回测结果进行横向比较。
- **策略市场**：展示所有公开策略，支持预览、复制和直接回测。

## 2. 文件变更

### 2.1 后端新增/修改

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `backend/app/strategy/user_store.py` | 修改 | 新增 `UserStrategyRecord.visibility` 字段；新增 `set_visibility()`、`export_strategy()`、`import_strategy()`、`list_public_strategies()` |
| `backend/app/strategy/registry.py` | 修改 | 导出新增函数供 API 层调用 |
| `backend/app/api/routes/strategies.py` | 修改 | 新增 6 个端点：导出、导入、可见性选项、设置可见性、版本对比、策略市场 |
| `backend/app/schemas/backtest.py` | 修改 | `BacktestRunRequest` 新增 `strategy_version` 可选字段 |
| `backend/app/engine/backtest.py` | 修改 | `BacktestConfig` 新增 `strategy_version` 字段 |
| `backend/app/services/backtest_service.py` | 修改 | 从请求载荷提取 `strategy_version` 并传入配置 |
| `backend/app/analysis/report.py` | 修改 | 报告中记录 `strategy_version`，用于版本对比 |
| `backend/tests/test_strategy_management.py` | 新增 | 17 个测试用例覆盖全部新增功能 |

### 2.2 前端新增/修改

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `frontend/src/services/api.ts` | 修改 | 新增接口类型和 API 方法（导出/导入/可见性/对比/市场） |
| `frontend/src/services/apiClient.ts` | 修改 | 新增 `put` 方法 |
| `frontend/src/pages/StrategiesPage.tsx` | 修改 | 新增导出按钮、导入上传、可见性开关、版本对比弹窗 |
| `frontend/src/pages/BacktestPage.tsx` | 修改 | 支持从 URL 读取 `version` 参数并写入请求 |
| `frontend/src/pages/MarketplacePage.tsx` | 新增 | 策略市场页面 |
| `frontend/src/App.tsx` | 修改 | 新增 `/marketplace` 路由 |
| `frontend/src/layout/AppLayout.tsx` | 修改 | 新增策略市场导航项 |

## 3. API 设计

### 3.1 策略导入导出

**导出策略**

```
POST /api/strategies/export
```

请求体：

```json
{
  "strategy_id": "my_strategy"
}
```

返回：`StrategyExportPayload`，包含 `format_version`、`exported_at`、`strategy`（含全量版本和代码）。

导出格式：

```json
{
  "format_version": "1.0",
  "exported_at": "2026-05-15T...",
  "strategy": {
    "id": "my_strategy",
    "title": "我的策略",
    "description": "策略说明",
    "params_schema": { ... },
    "visibility": "private",
    "created_at": "...",
    "updated_at": "...",
    "current_version": "v2",
    "versions": [
      {
        "version_id": "v1",
        "title": "...",
        "description": "...",
        "params_schema": { ... },
        "code": "from app.strategy.base import ...",
        "created_at": "...",
        "note": "..."
      }
    ]
  }
}
```

**导入策略**

```
POST /api/strategies/import
```

请求体：

```json
{
  "payload": { ... },
  "overwrite": false
}
```

- `overwrite=false`：策略已存在时返回 400 错误。
- `overwrite=true`：覆盖已有策略，导入的版本追加到现有版本历史。

### 3.2 可见性管理

**获取可见性选项**

```
GET /api/strategies/visibility-options
```

返回支持的值和中文描述。

**设置可见性**

```
PUT /api/strategies/user/{strategy_id}/visibility
```

请求体：

```json
{
  "visibility": "public"
}
```

可选值：`private`（默认，仅自己可见）、`public`（出现在策略市场）。

### 3.3 版本回测对比

```
GET /api/strategies/user/{strategy_id}/compare
```

查询 RunStore 中所有 `template_id` 匹配该策略的回测记录，按 `strategy_version` 分组，返回每组最优表现的指标对比：

```json
{
  "strategy_id": "my_strategy",
  "comparisons": [
    {
      "version_id": "v2",
      "run_count": 3,
      "best_run_id": "bt_abc123",
      "cumulative_return": 0.234,
      "annualized_return": 0.112,
      "sharpe_ratio": 1.45,
      "max_drawdown": -0.15,
      "win_rate": 0.62,
      "trade_count": 28
    }
  ]
}
```

**设计说明**：为支持版本对比，回测时需将当前策略版本写入 `BacktestRunRequest.strategy_version`。前端从策略页跳转回测时自动携带 `?version=v2` 参数，回测页将其写入请求。

### 3.4 策略市场

```
GET /api/strategies/marketplace
```

返回所有 `visibility="public"` 的用户策略及其代码：

```json
{
  "strategies": [
    {
      "id": "public_strategy",
      "title": "公开均线增强",
      "description": "...",
      "params_schema": { ... },
      "source": "user",
      "visibility": "public",
      "current_version": "v3",
      "version_count": 3,
      "code": "from app.strategy.base import ..."
    }
  ]
}
```

## 4. 数据模型

### 4.1 策略元数据 JSON (扩展)

在原有 `{strategy_id}.json` 字段基础上新增：

```json
{
  "visibility": "private"
}
```

- 新建策略默认为 `"private"`。
- 覆盖保存时保留已有 `visibility` 值。
- 导入策略时从导出文件继承 `visibility`。

### 4.2 导出格式版本

常量 `EXPORT_FORMAT_VERSION = "1.0"`。

导入时校验格式版本兼容性，不匹配时拒绝并提示期望版本。

## 5. 前端交互

### 5.1 策略工作台（StrategiesPage）

- **导出按钮**：选中用户策略后点击导出，浏览器下载 `{strategy_id}.quantpilot.json`。
- **导入按钮**：在侧栏策略资产卡片顶部，上传 `.json` 文件后弹出确认框，支持覆盖开关。
- **可见性开关**：概览标签页新增 Switch 组件，即时切换 private/public。
- **版本回测对比按钮**：版本历史标签页顶部，点击后弹窗展示各版本的最优回测指标表。

### 5.2 策略市场（MarketplacePage）

- 卡片网格展示所有公开策略。
- 每张卡片包含策略名称、描述、ID、版本数和最后更新时间。
- 操作：**查看**（弹窗预览完整代码）、**复制**（保存为我的策略）、**回测**（直接跳转回测页）。

### 5.3 回测页版本传递

```typescript
// 从策略页跳转
navigate(`/backtest?template=${selected.id}&version=${selected.current_version}`)

// 回测页读取并写入请求
strategyVersionRef.current = searchParams.get("version")
// payload.strategy_version = strategyVersionRef.current
```

## 6. 安全约束

- 导入策略代码在本地执行，前端有警告提示。
- 策略导出使用 JSON 格式，不含二进制载荷。
- 市场仅展示公开策略，不暴露私有策略的代码。
- 所有策略代码仍需通过 AST 校验（`Strategy` 子类 + `on_bar` 方法）。
- 导入的策略 ID 仍需符合 `^[a-z][a-z0-9_]{2,63}$` 且不冲突内置模板。

## 7. 测试覆盖

`backend/tests/test_strategy_management.py`（17 个用例）：

| 分类 | 用例 | 说明 |
|---|---|---|
| 可见性 | `test_new_strategy_defaults_to_private_visibility` | 默认 private |
| 可见性 | `test_save_with_explicit_public_visibility` | 显式 public |
| 可见性 | `test_set_visibility_toggle` | 切换可见性 |
| 可见性 | `test_set_visibility_rejects_invalid_value` | 拒绝无效值 |
| 可见性 | `test_set_visibility_on_nonexistent_strategy` | 不存在的策略 |
| 可见性 | `test_overwrite_preserves_visibility` | 覆盖保持可见性 |
| 导出 | `test_export_strategy_contains_all_versions` | 含全量版本 |
| 导出 | `test_export_nonexistent_strategy_raises` | 不存在的策略 |
| 导入 | `test_import_creates_new_strategy_from_export` | 新建导入 |
| 导入 | `test_import_rejects_existing_strategy_without_overwrite` | 拒绝重复 |
| 导入 | `test_import_overwrites_existing_strategy` | 覆盖导入 |
| 导入 | `test_import_rejects_invalid_format_version` | 拒绝旧版本 |
| 导入 | `test_import_rejects_missing_strategy_object` | 拒绝无效载荷 |
| 导入 | `test_import_rejects_empty_versions` | 拒绝空版本 |
| 市场 | `test_list_public_strategies_only_returns_public` | 仅返回公开 |
| 市场 | `test_list_public_strategies_empty_when_none_public` | 无公开策略 |
| 完整性 | `test_export_includes_all_metadata_fields` | 字段完整性 |

## 8. 验证记录

```bash
# 后端测试
cd backend
pytest tests/ -v --ignore=tests/test_data_provider.py
# 结果：66 passed

# 前端类型检查
cd frontend
npm run typecheck
# 结果：通过，无类型错误
```

## 9. 第二阶段扩展（标签、Fork、评论、导出 v1.1）

### 9.1 策略标签与分类

**数据模型**：策略元数据 JSON 新增 `tags`（字符串数组，最多 10 个）和 `category`（枚举值）。

**分类枚举**：

| 值 | 中文标签 |
|---|---|
| `trend` | 趋势跟踪 |
| `reversal` | 反转策略 |
| `momentum` | 动量策略 |
| `mean_reversion` | 均值回归 |
| `arbitrage` | 套利策略 |
| `ml` | 机器学习 |
| `custom` | 自定义（默认） |

**API**：

```
GET    /api/strategies/tags                         # 聚合所有策略的标签列表
GET    /api/strategies/categories                    # 分类选项列表
PUT    /api/strategies/user/{id}/tags               # 更新标签和分类
```

**前端**：策略工作台概览标签页新增"标签与分类"卡片，使用 Ant Design `Select` 的 `tags` 模式输入标签，下拉选择分类。

### 9.2 Fork 策略

将市场中的公开策略 Fork 为我的策略，自动记录来源信息。

**API**：

```
POST   /api/strategies/marketplace/{id}/fork         # Fork 策略到我的策略
```

请求体：

```json
{
  "new_id": "my_forked_ma",
  "new_title": "我的均线策略 (Fork)"
}
```

**行为**：
- 仅可 Fork 公开策略（私有策略返回 400）。
- 新策略默认为 `private`，复制原策略的所有版本代码。
- 元数据记录 `forked_from`（源策略 ID）和 `forked_at`（Fork 时间戳）。
- 自动复制原策略的标签和分类。

**前端**：策略市场卡片增加 **Fork** 按钮，弹出填写新 ID 和名称的表单。

### 9.3 策略评论

为市场中的公开策略提供评论讨论功能。

**数据模型**：

```python
@dataclass(frozen=True)
class CommentRecord:
    id: str           # 格式 cmt_{hex8}
    strategy_id: str
    author: str       # 默认 "anonymous"
    content: str      # 最多 500 字符
    created_at: str
```

**API**：

```
GET    /api/strategies/marketplace/{id}/comments           # 评论列表
POST   /api/strategies/marketplace/{id}/comments           # 添加评论
DELETE /api/strategies/marketplace/{id}/comments/{cid}     # 删除评论
```

**安全约束**：
- 评论存储在策略元数据 JSON 的 `comments` 数组中。
- 当前无认证：作者为自由填写的昵称，评论可被任何人删除（待多用户系统补齐权限）。

**前端**：策略市场预览弹窗底部新增评论区，支持输入昵称、评论内容和删除。

### 9.4 导出格式 v1.1

导出格式升级至 `"1.1"`，新增字段：

- `tags`：标签列表
- `category`：策略分类
- `forked_from`：Fork 来源策略 ID
- `forked_at`：Fork 时间

**向后兼容**：导入时同时接受 `"1.0"` 和 `"1.1"` 格式，v1.0 导入的策略默认 `tags=[]`、`category="custom"`。

## 10. 测试覆盖

`backend/tests/test_strategy_management.py`（17 个用例）：基础管理功能。

`backend/tests/test_strategy_extensions.py`（20 个用例）：

| 分类 | 用例数 | 覆盖功能 |
|---|---|---|
| 标签与分类 | 8 | 默认值、显式设置、更新、去重、上限、分类校验、聚合 |
| Fork | 3 | 创建副本、拒绝私有源、拒绝重复 ID |
| 评论 | 5 | 添加、默认作者、拒绝空内容、删除、不存在评论 |
| 导出 v1.1 | 4 | 新字段导出、v1.0 向后兼容、标签保留、覆盖保持 |

## 11. 后续扩展方向（待实现）

- **多用户系统**：当前所有功能和权限均面向单用户本地环境，需增加 `owner` 字段和完整的权限矩阵（owner/edit/view）。
- **评论审核与举报**：评论系统目前无审核机制，需引入内容审核和举报流程。
- **策略依赖声明**：导入/导出时自动检测策略代码中使用的指标函数和 Python 包依赖。
- **Git 集成**：将策略版本历史与 Git 仓库同步。
- **策略市场评分/Star**：为市场策略增加量化评价机制。
- **CI 式策略验证**：策略更改时自动运行预设回测检查性能退化。

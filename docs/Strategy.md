# 策略模块开发记录

本文记录 `backend/app/strategy` 策略模块的当前设计、对接接口、本次完善内容与验证过程。

## 1. 模块目标

策略模块负责把用户可选择的策略模板转换为回测引擎可执行的 `Strategy` 实例，并提供前端可渲染的参数 schema。按照 `DEVELOPMENT.md` 的 MVP 要求，当前策略模块需要完成：

- 策略基类接口：`initialize(params)`、`on_bar(context)`、`finalize()`。
- 内置策略模板：双均线、RSI、MACD。
- 基础指标库：SMA、EMA、MACD、RSI。
- 参数 schema：使用简化 JSON Schema 供前端自动渲染参数表单。
- 与回测服务、事件驱动引擎、策略模板 API 保持稳定接口。

## 2. 文件结构

```text
backend/app/strategy/
  base.py                  策略基类、StrategyContext、OrderRouter 协议
  indicators.py            SMA / EMA / RSI / MACD 指标函数
  registry.py              策略模板注册表与工厂
  templates/
    dual_ma.py             双均线交叉策略
    rsi.py                 RSI 阈值反转策略
    macd.py                MACD 金叉 / 死叉策略
```

## 3. 对接接口

### 3.1 API 对接

`backend/app/api/routes/strategies.py` 调用：

```python
list_templates() -> list[StrategyTemplate]
get_template(template_id: str) -> StrategyTemplate
```

`StrategyTemplate` 输出给前端的字段：

```python
id: str
title: str
description: str
params_schema: dict[str, Any]
code: str  # 仅模板详情接口返回
```

其中 `factory` 只在后端使用，不通过 API 返回。

### 3.2 回测服务对接

`backend/app/services/backtest_service.py` 调用：

```python
create_strategy(template_id: str) -> Strategy
```

该接口必须每次返回新的策略实例，避免不同回测任务共享策略内部状态。

### 3.3 回测引擎对接

`backend/app/engine/backtest.py` 调用策略生命周期：

```python
strategy.initialize(config.strategy_params)
strategy.on_bar(ctx)
strategy.finalize()
```

策略通过 `StrategyContext` 读取当前 K 线、历史窗口、参数与状态，并通过上下文下单：

```python
ctx.order_target_percent(target_percent)
ctx.submit_order(side, quantity, order_type, limit_price)
ctx.position()
```

策略模块只依赖 `OrderRouter` 协议，不直接访问 broker 或 portfolio 内部实现。

## 4. 本次完善内容

### 4.1 新增 RSI 策略模板

文件：`backend/app/strategy/templates/rsi.py`

策略 ID：`rsi_reversion`

逻辑：

- RSI 低于或等于 `oversold` 时，建仓至 `target_percent`。
- RSI 高于或等于 `overbought` 时，清仓。
- 参数在 `initialize()` 中校验，非法参数抛 `InvalidParamsError`。

参数 schema：

- `window`
- `oversold`
- `overbought`
- `target_percent`

### 4.2 新增 MACD 策略模板

文件：`backend/app/strategy/templates/macd.py`

策略 ID：`macd_cross`

逻辑：

- MACD 线上穿信号线时，建仓至 `target_percent`。
- MACD 线下穿信号线时，清仓。
- 参数在 `initialize()` 中校验，非法参数抛 `InvalidParamsError`。

参数 schema：

- `fast`
- `slow`
- `signal`
- `target_percent`

### 4.3 更新策略注册表

文件：`backend/app/strategy/registry.py`

变更：

- 注册 `dual_ma`、`rsi_reversion`、`macd_cross` 三个内置模板。
- 增加 `_register()`，启动时检查重复策略 ID。
- 保持 `list_templates()`、`get_template()`、`create_strategy()` 三个外部接口不变。

### 4.4 更新模板包入口

文件：`backend/app/strategy/templates/__init__.py`

变更：

- 导出三个内置策略类，方便后续单测或内部模块稳定引用。

### 4.5 用户策略保存与加载

文件：

- `backend/app/strategy/user_store.py`
- `backend/app/api/routes/strategies.py`
- `frontend/src/pages/StrategiesPage.tsx`
- `frontend/src/services/api.ts`

后端新增本地用户策略存储：

- 保存目录来自 `RuntimeConfig.strategies_dir`，默认是 `backend/data/strategies`。
- 每个用户策略保存为两份文件：`{strategy_id}.py` 存代码，`{strategy_id}.json` 存标题、描述和参数 schema。
- 策略 ID 约束为 `^[a-z][a-z0-9_]{2,63}$`，并禁止覆盖内置模板 ID。
- 保存前会编译 Python 代码，并确认代码中定义了 `Strategy` 子类。
- `registry.py` 的 `list_templates()` 会合并内置模板和用户策略；`create_strategy()` 可创建用户策略实例，因此回测服务无需改动。

新增 API：

```text
POST /api/strategies/user
GET  /api/strategies/user/{strategy_id}
```

`POST /api/strategies/user` 请求体：

```json
{
  "id": "my_strategy",
  "title": "我的策略",
  "description": "策略说明",
  "code": "from app.strategy.base import Strategy, StrategyContext\n...",
  "params_schema": {
    "type": "object",
    "title": "我的策略",
    "properties": {
      "target_percent": {
        "type": "number",
        "title": "目标仓位",
        "minimum": 0.01,
        "maximum": 1.0,
        "default": 0.95
      }
    },
    "required": ["target_percent"]
  },
  "overwrite": false
}
```

前端策略页现在支持：

- 基于内置模板填写策略 ID、名称、描述。
- 选择内置模板或用户策略时，通过 `GET /api/strategies/templates/{template_id}` 加载真实 Python 源码并渲染到 Monaco Editor。
- 在 Monaco Editor 中编辑 Python 策略代码。
- 编辑参数 schema JSON。
- 点击“保存为我的策略”写入后端。
- 保存成功后刷新模板列表，用户策略可在回测页被选择。

安全边界仍按 `DEVELOPMENT.md` 的 MVP 约定：当前只面向本地可信用户。进入多用户或共享环境前必须增加进程隔离、超时、内存 / 文件 / 网络限制和依赖白名单。

## 5. 测试覆盖

新增文件：`backend/tests/test_strategy_registry.py`

覆盖内容：

- 注册表必须暴露 `dual_ma`、`rsi_reversion`、`macd_cross`。
- 每个模板必须包含标题、描述、参数 schema。
- `create_strategy(template_id)` 必须返回名称匹配的新策略实例。
- 三个内置策略必须能接入 `run_backtest()` 并用 mock 数据跑完整回测。
- 三个内置策略必须拒绝非法参数。
- 用户策略保存后必须进入模板列表，并能接入 `run_backtest()`。

更新文件：`backend/tests/test_api.py`

覆盖内容：

- `/api/strategies/templates` 必须返回三个内置策略 ID。
- `/api/strategies/user` 必须能保存用户策略，保存后 `/api/strategies/templates` 能列出该策略。

## 6. 验证记录

已执行：

```bash
python -m compileall app tests
```

结果：通过。

受限于当前环境未安装后端开发依赖，以下命令未能执行：

```bash
pytest
ruff check .
```

失败原因：

```text
command not found: pytest
command not found: ruff
python: No module named pytest
python: No module named ruff
```

安装 `pyproject.toml` 中的 dev 依赖后，应执行：

```bash
pytest
ruff check .
```

## 7. 策略管理与分享

策略管理功能（导入导出、可见性、版本对比、策略市场）已实现，详见 [StrategyManagement.md](./StrategyManagement.md)。

## 8. 后续扩展约定

新增策略模板时遵循同一流程：

1. 在 `backend/app/strategy/templates/` 新增策略文件。
2. 策略类继承 `Strategy`，实现 `on_bar()`，必要时覆盖 `initialize()` 和 `finalize()`。
3. 在 `initialize()` 中合并默认参数并做参数校验。
4. 使用 `StrategyContext` 下单，不直接依赖 broker / portfolio。
5. 定义 `PARAMS_SCHEMA`，保证前端可以渲染参数表单。
6. 在 `registry.py` 注册 `StrategyTemplate`。
7. 增加注册表测试、非法参数测试和回测冒烟测试。


## 9. Phase 1 — 参数优化引擎

补齐 README 中"参数优化范围定义与参数敏感性分析"目标功能，将前端模拟数据替换为真实后端计算。

### 9.1 网格搜索

**新增文件**：`backend/app/optimization/grid_search.py`

对策略参数的笛卡尔积组合逐一遍历，每个组合执行一次完整回测，收集 10 项绩效指标，按指定排序键返回结果矩阵。

核心接口：

```python
@dataclass
class GridSearchConfig:
    template_id: str
    symbol: str
    start: datetime
    end: datetime
    param_grid: dict[str, list[float | int]]  # 参数轴
    sort_by: str = "sharpe_ratio"             # cumulative_return, max_drawdown 等

def run_grid_search(config: GridSearchConfig) -> list[GridResultItem]
```

API 端点：

```
POST /api/optimization/grid-search
```

返回 `total_combinations`、`sort_by` 和 `results` 数组（每项含 params + 10 个绩效指标）。

### 9.2 敏感性分析

**新增文件**：`backend/app/optimization/sensitivity.py`

对每个参数，固定其他参数为基准值，沿该参数轴向采样（默认 10 个采样点），量化每个参数对夏普比率的影响程度（impact_score = 夏普最大差值）。

```python
@dataclass
class SensitivityResult:
    param_name: str
    title: str
    points: list[SensitivityPoint]
    impact_score: float  # 越大越敏感
```

API 端点：

```
POST /api/optimization/sensitivity
```

返回按 `impact_score` 降序排列的参数敏感度列表，每个含采样点数组。

### 9.3 前端改造

**重写** [OptimizationPage.tsx](Quantpilot/frontend/src/pages/OptimizationPage.tsx)：移除 `generateMockGrid` 模拟数据，接入真实 API。

- **网格搜索标签页**：参数范围编辑器（起始/结束/步长）→ 调用 `runGridSearch` → 统计卡片 + Sharpe 热力图 + Top 10 排名表
- **敏感性分析标签页**：基准参数 + 采样范围编辑器 → 调用 `runSensitivity` → 影响度排序 + 参数敏感度折线图 + 各参数采样点明细表

**新增文件**：`backend/app/schemas/optimization.py` — Pydantic 请求/响应模型。

### 9.4 测试

`backend/tests/test_optimization.py`（7 个用例）：网格搜索结果数量、排序、单轴参数、敏感度基本流程、分值排序等。


## 10. Phase 2 — 扩展指标库与策略模板

### 10.1 新增指标

**修改文件**：[indicators.py](Quantpilot/backend/app/strategy/indicators.py)

新增 5 个指标函数：

| 函数 | 签名 | 说明 |
|---|---|---|
| `bollinger_bands` | `(close, window=20, num_std=2.0)` | 布林带：上轨、中轨、下轨 |
| `atr` | `(high, low, close, window=14)` | 平均真实波幅 |
| `kdj` | `(high, low, close, n=9, k_window=3, d_window=3)` | KDJ 随机指标：%K、%D、%J 线 |
| `obv` | `(close, volume)` | 能量潮 |
| `williams_r` | `(high, low, close, window=14)` | 威廉指标 |

### 10.2 新增策略模板

| 模板 ID | 标题 | 文件 | 说明 |
|---|---|---|---|
| `bollinger_breakout` | 布林带突破 | [templates/bollinger.py](Quantpilot/backend/app/strategy/templates/bollinger.py) | 价格触及下轨建仓，跌破中轨清仓 |
| `turtle_trading` | 海龟交易 | [templates/turtle.py](Quantpilot/backend/app/strategy/templates/turtle.py) | Donchian 通道突破入场，低点出场 |

每个模板遵循统一规范：`Strategy` 子类、`PARAMS_SCHEMA`、`initialize` 参数校验。

### 10.3 注册与保护

- [registry.py](Quantpilot/backend/app/strategy/registry.py) 注册 5 个内置模板（+2 新增）
- [user_store.py](Quantpilot/backend/app/strategy/user_store.py) `_BUILTIN_IDS` 更新为 5 个保护 ID

### 10.4 前端指标目录更新

[StrategiesPage.tsx](Quantpilot/frontend/src/pages/StrategiesPage.tsx) 内置指标库卡片从 4 个扩展至 9 个，分类增加"波动"和"量价"。

### 10.5 测试

`backend/tests/test_indicators.py` 从 4 个用例扩展至 9 个（新增布林带、ATR、KDJ、OBV、威廉指标测试）。


## 11. Phase 3 — 代码片段与快速验证

### 11.1 快速验证 API

```
POST /api/strategies/validate
```

请求体：

```json
{
  "code": "from app.strategy.base import ..."
}
```

执行三步验证：
1. **语法检查**：`ast.parse` 编译 Python 代码
2. **结构检查**：确认有 `Strategy` 子类且实现了 `on_bar` 方法
3. **运行时验证**：用 Mock 数据执行 1 个月迷你回测

返回：

```json
{
  "valid": true/false,
  "errors": [{"type": "syntax|structure|runtime", "message": "..."}],
  "warnings": [{"type": "inactive", "message": "策略未产生任何订单"}],
  "stats": {"bars_processed": 22, "orders_generated": 2, "final_value": 998000, "trades": 1}
}
```

### 11.2 代码片段

前端编辑器上方新增片段工具栏，提供 4 个可插入模板：

| 片段 | 说明 |
|---|---|
| 新策略 | 完整 Strategy 子类模板（initialize / on_bar / finalize） |
| SMA 交叉 | 双均线交叉清仓/建仓模式 |
| RSI 反转 | RSI 超买超卖反转逻辑 |
| PARAMS_SCHEMA | 参数定义 JSON Schema 模板 |

点击片段按钮即替换编辑器内容为对应代码模板。

### 11.3 前端集成

- [StrategiesPage.tsx](Quantpilot/frontend/src/pages/StrategiesPage.tsx) 代码标签页编辑器上方新增"快速验证"按钮和 4 个片段按钮
- [api.ts](Quantpilot/frontend/src/services/api.ts) 新增 `validateCode` API 方法


## 12. 验证记录（最终）

```bash
# 后端测试
cd backend
pytest tests/ -v --ignore=tests/test_data_provider.py
# 结果：78 passed

# 前端类型检查
cd frontend
npm run typecheck
# 结果：通过，无类型错误

# 策略模板
curl http://127.0.0.1:8000/api/strategies/templates
# 返回 5 个内置模板：dual_ma, rsi_reversion, macd_cross,
#                    bollinger_breakout, turtle_trading

# 指标库
# 可用指标：SMA, EMA, RSI, MACD, Bollinger Bands, ATR, KDJ, OBV, Williams %R
# 共 9 个指标函数
```

## 13. 文件结构（最终）

```text
backend/app/
  strategy/
    base.py                     Strategy 基类、StrategyContext、OrderRouter
    indicators.py               SMA / EMA / RSI / MACD / Bollinger / ATR / KDJ / OBV / Williams %R
    registry.py                 策略模板注册表与工厂（5 内置 + 用户策略）
    templates/
      __init__.py
      dual_ma.py               双均线交叉
      rsi.py                   RSI 阈值反转
      macd.py                  MACD 金叉/死叉
      bollinger.py             布林带突破           ★ Phase 2
      turtle.py                海龟交易             ★ Phase 2
    user_store.py              用户策略 CRUD、版本管理、导入导出、标签、Fork、评论
  optimization/
    __init__.py
    grid_search.py             网格搜索引擎          ★ Phase 1
    sensitivity.py             参数敏感性分析        ★ Phase 1
  api/routes/
    strategies.py              策略模板 + 验证 + 导入导出 + 标签 + Fork + 评论
    optimization.py            网格搜索 + 敏感性分析  ★ Phase 1
  schemas/
    optimization.py           优化请求/响应模型      ★ Phase 1
```

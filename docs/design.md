这份文档将我们多次碰撞出的财务哲学（权责发生制、资产即期权、折旧摊销）转化为技术架构。它不仅是一个数据库 Schema，更是一套**个人财政管理协议**。

# ---

**个人财政管理系统设计文档 (Project Oikonomos)**

## **1\. 设计哲学**

本系统跳出传统的“流水账”模式，采用**权责发生制 (Accrual Basis)** 为核心逻辑，旨在解决以下三大痛点：

* **财富幻觉**：大额支出后现金流断裂与日常消费过高的感知错位。  
* **资产损耗**：忽略长期持有资产（车、数码产品）的隐性贬值。  
* **认知负荷**：在重叠的分类规则中纠结，无法直观看到“生活真实成本”。

## ---

**2\. 核心业务逻辑**

### **2.1 账户双轨制**

系统将账户分为 **资产 (Assets)** 与 **负债 (Liabilities)**。

* **净资产计算**：$NetWorth \= \\sum Assets\_{balance} \- \\sum |Liabilities\_{balance}|$。  
* **信用建模**：信用卡余额以负数表示，消费行为增加负值，还款行为（转账）抵消负值。

### **2.2 权责发生制开关 (The Accrual Toggle)**

* **现金流视图 (Cash Flow)**：统计所有真实的 Transactions 记录。  
* **损益视图 (Profit & Loss)**：剔除大额资产初始购买支出，引入 Amortization\_Schedules 生成的虚拟折旧，反映真实的日/月度生活成本。

### **2.3 资产即期权 (Asset as Option)**

对于高单价、低频使用的精神类资产（如相机），引入 Asset\_Purpose。当标记为 Spiritual 时，折旧不再视为“亏损”，而是“摄影权利金”的支付。

## ---

**3\. 数据表结构设计 (Database Schema)**

### **3.1 账户与资产层 (Account & Asset)**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| id | UUID | 唯一标识 |
| name | String | 账户名称（如：工资卡、24万的车） |
| type | Enum | Asset, Liability |
| purpose | Enum | Investment, Productivity, LifeSupport, Spiritual |
| balance | Decimal | 当前余额（负债为负） |
| depreciation\_id | UUID? | 可选，关联折旧计划 |

### **3.2 交易核心层 (Transactions)**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| id | UUID | 唯一标识 |
| amount | Decimal | 交易金额 |
| from\_acc | UUID | 来源账户 |
| to\_acc | UUID | 去向账户（外部商家或内部账户） |
| category\_id | UUID | 职能分类（饮食、日用、精神生活等） |
| accrual\_type | Enum | Flow (现金流), Depreciation (折旧虚拟交易), Adjustment (平账) |
| timestamp | DateTime | 交易发生时间 |

### **3.3 维度管理层 (Dimensions)**

* **Categories 表**：定义“为什么花钱”。采用父子结构，强调**职能互斥**。  
* **Tags 表**：定义“钱花在哪”。支持多对多关联，解决**规则重叠**（如 \#超市, \#外卖）。  
* **Payees 表**：商家信息，绑定默认 Category 实现自动化归类。

### **3.4 时间价值层 (Amortization & Options)**

| 字段 | 类型 | 说明 |
| :---- | :---- | :---- |
| id | UUID | 唯一标识 |
| asset\_id | UUID | 关联资产 |
| strategy | Enum | Linear (直线折旧), Accelerated (加速折旧) |
| total\_periods | Integer | 总分摊期数（如 120 个月） |
| residual\_val | Decimal | 预计残值 |
| start\_date | Date | 开始计费时间 |

## ---

**4\. 关键业务流程设计**

### **4.1 大额资产录入流程（如：购买 2 万相机）**

1. **产生记录**：在 Transactions 插入一笔交易，from\_acc 为银行卡，to\_acc 为相机账户（资产内部转移），accrual\_type 为 Flow。  
2. **初始化计划**：系统根据用户设定的 4 年寿命，在 Amortization\_Schedules 插入一条计划。  
3. **成本映射**：在后续的每月报告中，系统不提取那笔 2 万的记录，而是从计划表中读取一条 416 元的虚拟记录。

### **4.2 余额对账与坏账处理**

1. **手动快照**：用户录入某账户真实余额。  
2. **误差计算**：$Delta \= 真实余额 \- 系统计算余额$。  
3. **自动平账**：若 $Delta \\neq 0$，系统自动生成一笔 accrual\_type \= Adjustment 的记录。  
4. **指标监控**：计算 $\\frac{\\sum Adjustment}{\\sum Total\_Expense}$，作为用户记账诚实度/系统准确度的 KPI。

## ---

**5\. 统计维度逻辑**

系统提供双重 Filter 逻辑：

### **逻辑 A：日常对账 (Cash-Centric)**

* **SELECT** From Transactions WHERE accrual\_type \!= Depreciation。  
* **用途**：核对银行账单，查看流动性。

### **逻辑 B：真实损益 (Utility-Centric)**

* **SELECT** From Transactions WHERE accrual\_type \== Flow AND is\_asset\_purchase \== False。  
* **UNION ALL**  
* **SELECT** From Amortization\_Schedules WHERE current\_period \== this\_month。  
* **用途**：生成月度饼图，评估生活标准，决定是否需要削减开支。

## ---

**6\. 后续扩展方向**

* **资产效能比**：结合 Option\_Exercises 表，计算单位使用成本（如：相机的单次快门成本）。  
* **自动化规则引擎**：在 Rust 后端实现正则匹配，自动为特定 Payee 打上 \#超市 标签并关联 Spiritual 资产属性。

---
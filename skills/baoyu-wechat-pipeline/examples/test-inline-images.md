---
title: 插图生成测试
---

# 插图生成功能测试

## 测试 1: 纯文字描述（最简写法）

下面是一个只包含 content 字段的最简 image-gen 块：

```image-gen
content: 一个简洁的圆形图标，中心是一颗闪亮的五角星，背景为渐变蓝色，扁平矢量风格
image: ./images/star-icon.png
alt: 测试图标
```

## 测试 2: 带参考风格图 + 指定输出路径

下面使用 ref 指定参考风格图，image 指定输出路径：

```image-gen
ref: ./refs/flat-style.png
content: |
  一张简单的流程图，展示三个步骤：
  1. 输入（蓝色方块）
  2. 处理（绿色方块）
  3. 输出（橙色方块）
  步骤之间用箭头连接，使用参考图中的扁平矢量风格和配色。
image: ./images/flow-chart.png
ar: 16:9
alt: 三步流程图
```

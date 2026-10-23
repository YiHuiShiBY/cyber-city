# 雨夜霓虹 · NEON CROSSING

一座在浏览器里实时呼吸的赛博朋克雨夜城市：雨夜里，104 栋程序化楼宇、544 名行人、46 辆穿行车流同时运转，霓虹招牌、探照灯、湿路反光全部实时计算——没有一帧是预渲染。

**在线演示**：[仪绘士 · 画境长廊](https://yihuishi.com) —— 作品 04「雨夜霓虹 · NEON CROSSING」。

## 运行方式

纯静态、零构建、零外部依赖：Three.js 已内置在 `vendor/`，建筑与飞行器模型内置在 `assets/`，启动后不需要联网。页面使用 ES Module，请通过任意静态服务器打开：

```bash
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## 操作

- 点击画面激活控制后：拖动旋转、滚轮缩放、键盘漫游
- 面板内置五个电影机位——巨城全景、街头漫游、云端双塔、天穹总部、环城高架
- 氛围开关：雨势、辉光、反射、时间流速（低配设备可关闭辉光）

## 场景构成

- 104 栋程序化楼宇与街道地面，含 Blender 建模的飞行器模型（`assets/blender-aircraft/`）
- 544 名实时行人、46 辆穿行车流，CPU 调度经过四倍以上优化
- UnrealBloom 辉光与 ACES 色调映射负责夜的氛围，PMREM 环境光照负责材质呼吸；近 80 万三角面在普通设备上流畅运转
- 附带 `character-admin.html` 行人角色管理页

## 技术栈

Three.js（本地内置副本，许可见 `vendor/LICENSE.three.txt`，MIT）+ glTF。无构建流程、无框架、无运行时外部请求。

## 声明与许可

- 第三方组件：[Three.js](https://github.com/mrdoob/three.js)（MIT，全文见 `vendor/LICENSE.three.txt`）。
- 除上述第三方组件外，本仓库的代码与内容**保留所有权利**。

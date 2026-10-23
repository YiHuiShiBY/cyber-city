# Blender 空中载具

五套模型由 Blender 5.2.2 实际建模、倒角求值、导出及渲染，供主城近景和角色管理台共用。

| 文件前缀 | 模型 | Blender 原始导出层 |
| --- | --- | --- |
| legacy-flyer | 城市飞行器 | body / lights |
| airship | 巨型飞艇 | body / lights |
| passenger | 空中客运 | body / glass / lights |
| cargo | 空中货运 | body / glass / lights |
| cruiser | 空中巡航 | body / glass / lights |

`.blend` 保留命名分件、材质及倒角修改器；`-studio.png` / `-rear.png` 是 Blender 实际渲染。`.js` 是离线二进制属性的 Base64 编码，`.json` 记录面数、包络、每个源分件和 Blender 版本。Three.js 的 `aircraft-blender-models.js` 解码本地数据并向调用者返回独立几何副本，无外部请求、插件或新增运行时依赖。

2026-10-03：浏览器在解码后通过 `aircraft-lighting.js` 分离城市飞行器与飞艇的玻璃、切出真实舱窗开口并补入舱内结构和灯光，五类显示模型均具有 body / glass / lights。原 Blender 文件及上述棚拍图保持建模交付版本；当前玻璃、灯光效果以 `previews/lighting-refinement/after/` 的浏览器截图为准。分件索引由 `node tools/prepare-aircraft-parts.cjs` 从导出数据生成，更改 Blender 导出后须同步重新生成。

构建脚本在 `tools/blender/`：`build_scouts.py` 生成城市飞行器和巡航机，`build_transports.py` 生成客运及货运，`build_airship.py` 生成飞艇，`common.py` 统一坐标、材质、求值导出和灯光。分别使用本机 Blender 的 `--background --factory-startup --python <脚本>` 运行。`render_aircraft.py` 可从已保存的 `.blend` 重新拍摄前后视图，不改变运行时数据。

模型坐标统一为 Three.js 的 Y 向上、Z 为机头；飞艇长轴为 X，源文件按实际比例建模，导出时使用 `[1/15,1/3.5,1/3.5]` 归一化，城市仍沿用原实例缩放与航线。高模复用现有合批，远景继续使用原低模。

验证：`npm run qa:blender`（Node 22.15+，用于解压 Blender 5 的 Zstd 源文件并核对对应分件）；`npm run qa:transport`、`npm run qa:admin` 与 `npm run gates` 验证实际浏览器及城市。技术检查不代替美术审阅。

# 鹈鹕骑行记 · Pelican Ride 3D

纯静态网页，无需后端、无需安装依赖（Three.js 已内置在 lib/ 目录）。

## 本地运行
浏览器因安全限制不能直接双击 index.html 运行（ES 模块需要 HTTP 服务），任选一种：
- Python：在本文件夹内运行 `python3 -m http.server 8080`，然后打开 http://localhost:8080
- Node：`npx serve .`
- VS Code：安装 Live Server 插件，右键 index.html → Open with Live Server

## 免费部署（获得永久链接）
- Netlify：打开 https://app.netlify.com/drop ，把整个文件夹拖进去即可
- GitHub Pages：新建仓库上传所有文件 → Settings → Pages → 选择 main 分支
- Vercel：`npx vercel` 或在网页上导入仓库

## 文件说明
- index.html   页面与界面
- main.js      3D 场景、动画、小游戏、天气、音效
- lib/         Three.js r160 及附加模块（OrbitControls、Bloom 后期）
- assets/      AI 生成的海报图片与语音导览

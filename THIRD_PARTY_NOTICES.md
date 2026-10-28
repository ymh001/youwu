# Third-party notices

本项目原创代码、文档和公开版状态 SVG 采用 MIT，见 [LICENSE](LICENSE)。依赖保留各自的许可证和版权声明；项目许可不替代第三方许可。

公开版不包含私人部署素材、参考产品截图、图库演示照片或带其他平台品牌标识的状态水印。默认封面与可选演示数据使用系统 emoji；不分发字体文件。

## Frontend runtime dependencies

以下清单按当前锁定依赖生成，保留各包所附许可证全文。

| Package | Version | License | Text |
| --- | --- | --- | --- |
| @remix-run/router | 1.23.4 | MIT | [License](web/public/licenses/vendor/remix-run__router.txt) |
| @types/prop-types | 15.7.15 | MIT | [License](web/public/licenses/vendor/types__prop-types.txt) |
| @types/react | 18.3.31 | MIT | [License](web/public/licenses/vendor/types__react.txt) |
| csstype | 3.2.3 | MIT | [License](web/public/licenses/vendor/csstype.txt) |
| framer-motion | 14.6.0 | MIT | [License](web/public/licenses/vendor/framer-motion.txt) |
| js-tokens | 4.0.0 | MIT | [License](web/public/licenses/vendor/js-tokens.txt) |
| loose-envify | 1.4.0 | MIT | [License](web/public/licenses/vendor/loose-envify.txt) |
| lucide-react | 1.61.0 | ISC | [License](web/public/licenses/vendor/lucide-react.txt) |
| motion | 14.6.0 | MIT | [License](web/public/licenses/vendor/motion.txt) |
| motion-dom | 14.6.0 | MIT | [License](web/public/licenses/vendor/motion-dom.txt) |
| motion-utils | 14.6.0 | MIT | [License](web/public/licenses/vendor/motion-utils.txt) |
| react | 18.3.1 | MIT | [License](web/public/licenses/vendor/react.txt) |
| react-dom | 18.3.1 | MIT | [License](web/public/licenses/vendor/react-dom.txt) |
| react-router | 6.30.6 | MIT | [License](web/public/licenses/vendor/react-router.txt) |
| react-router-dom | 6.30.6 | MIT | [License](web/public/licenses/vendor/react-router-dom.txt) |
| scheduler | 0.23.2 | MIT | [License](web/public/licenses/vendor/scheduler.txt) |
| tslib | 2.8.1 | 0BSD | [License](web/public/licenses/vendor/tslib.txt) |

## Backend and build tooling

Python依赖列在 `backend/requirements.txt`，前端及构建依赖锁定在 `web/package-lock.json`。安装时由包管理器分发各自的版权声明与许可证。Docker使用官方Node和Python基础镜像；镜像内的系统组件也保留各自许可。

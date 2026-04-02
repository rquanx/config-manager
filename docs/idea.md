实现一个 config manager cli 工具，用来管理多个配置文件
- 发布成 npm 包
- 使用方式
 - config-manager create <group-name> <path1> <path2>....: 创建一个管理分组，path 可以是文件或文件夹，数量任意个，group 下所有 item 共享 path
 - config-manager group add <group-name> <item-name>: 添加一个 group 下的 item ,并且根据 group 设置的 path 对文件进行一次快照保存
 - config-manager group delete <group-name>: 删除整个分组
 - config-manager group delete <group-name> <item-name>: 删除一个 group item,如果删除的是当前item 则自动切换第一个剩余项
 - config-manager switch <group-name> <item-name>：切换配置，要把文件进行替换

技术选型：react-ink、pnpm


先不急着编码，你审查下我的需求，然后向我提问补全信息


1.可以
2.按你推荐的来
3.创建分组并且创建默认
4.提示确认后覆盖
5.提示是否再次快照后再切换，--force 可以直接忽略，强制切换
6.递归目录，保存隐藏文件，处理符号链接、空目录忽略
7.只处理 group 配置的文件/文件夹，进行覆写
8.允许为空
9.给出冲突提示，如果确认则允许
10.个人使用

跨平台,加上以下命令
config-manager list
config-manager current <group-name>
config-manager group list

包名是 rquanx/config-manager

1.default
2.询问覆盖当前 item 还是新建一个来保存
3.报错
4.要确认，支持 --force
5.保存并恢复“链接本身”
6.对的
7.>=20
8.config-manager list 列出 group，config-manager group list 列出group item 同时显示哪个active
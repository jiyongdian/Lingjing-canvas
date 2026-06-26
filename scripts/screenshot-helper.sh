#!/bin/bash
# 万卷灵境截图自动化脚本
# 使用方法：在每个界面停留后按回车键，脚本会自动截图

SCREENSHOT_DIR="/Users/guan/Documents/画布/Lingjing-canvas/docs/screenshots-new"
mkdir -p "$SCREENSHOT_DIR"

echo "📸 万卷灵境 v1.3.2 截图工具"
echo "================================"
echo ""
echo "准备工作："
echo "1. 确保开发版万卷灵境正在运行"
echo "2. 将应用窗口最大化"
echo "3. 准备好要截图的内容"
echo ""
echo "按回车开始..."
read

screenshots=(
    "01-canvas.png|灵境画布 - 显示多个节点和连接线"
    "02-resources.png|资源库 - 显示各类素材"
    "03-agents.png|智能体 - 显示智能体列表或对话"
    "04-settings.png|设置 - 外观与通用设置"
    "05-config-butler.png|配置管家 - 模型与 API 配置"
    "06-data-backup.png|备份中心 - 项目与备份"
    "07-workspace.png|工作区 - 团队协作功能 (v1.3.0 新增)"
    "08-offline-tools.png|离线工具 - 工具包管理 (v1.3.0 新增)"
)

for item in "${screenshots[@]}"; do
    IFS='|' read -r filename description <<< "$item"
    echo ""
    echo "准备截取: $description"
    echo "文件名: $filename"
    echo ""
    echo "请在应用中切换到对应界面，准备好后按回车键截图..."
    read

    echo "倒计时: 3..."
    sleep 1
    echo "倒计时: 2..."
    sleep 1
    echo "倒计时: 1..."
    sleep 1

    screencapture -x "$SCREENSHOT_DIR/$filename"

    if [ -f "$SCREENSHOT_DIR/$filename" ]; then
        size=$(ls -lh "$SCREENSHOT_DIR/$filename" | awk '{print $5}')
        echo "✅ 截图成功! ($size)"
    else
        echo "❌ 截图失败!"
    fi
done

echo ""
echo "================================"
echo "🎉 所有截图完成!"
echo "截图保存在: $SCREENSHOT_DIR"
echo ""
echo "查看截图:"
echo "open $SCREENSHOT_DIR"

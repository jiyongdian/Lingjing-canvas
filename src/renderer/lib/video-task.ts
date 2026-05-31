/**
 * 视频任务匹配 / 剪贴板工具模块
 *
 * 职责：
 * - 判断后台视频生成任务（seedance / 通义万相 / 通用 video）是否与画布上的某个节点匹配，
 *   用于把已完成的任务结果回填到对应节点，或判断任务能否附着到节点。
 * - 在复制节点到剪贴板时，清洗掉运行期/结果相关的瞬态字段，得到可安全复制的数据快照。
 *
 * 纯逻辑模块，无 React / JSX 依赖。
 */

/** 节点数据对象（画布节点上的 data 字段），字段较为动态，故用宽松类型。 */
type WanjuanNodeData = Record<string, any>;

/** 画布节点，包含类型与 data。 */
interface WanjuanNode {
  id: string;
  type?: string;
  data?: WanjuanNodeData;
}

/** 后台视频生成任务记录。 */
interface WanjuanVideoTask {
  id?: string;
  status?: string;
  resultUrl?: string;
  stoppedByUser?: boolean;
  projectId?: string;
  prompt?: string;
  nodeId?: string;
  provider?: string;
  modelName?: string;
  model?: string;
  type?: string;
  customOutputType?: string;
}

/** 克隆节点数据时的可选项。 */
interface CloneNodeDataOptions {
  /** 为 true 时保留 selectedContextResources，否则会被删除。 */
  keepContextResources?: boolean;
}

/**
 * 复制节点数据到剪贴板前的清洗：浅拷贝后剔除函数属性与所有运行期/结果瞬态字段，
 * 默认还会移除已选中的上下文资源（除非 keepContextResources 为 true）。
 */
export function wanjuanCloneNodeDataForClipboard(
  nodeData: WanjuanNodeData | null | undefined,
  options: CloneNodeDataOptions = {},
): WanjuanNodeData {
  let cloned: WanjuanNodeData = {
    ...(nodeData || {}),
  };
  Object.keys(cloned).forEach((key) => {
    if (typeof cloned[key] === `function`) delete cloned[key];
  });
  [
    `loading`,
    `progress`,
    `status`,
    `errorMessage`,
    `errorMsg`,
    `taskId`,
    `seedanceTaskId`,
    `audioTaskId`,
    `videoUrl`,
    `imageUrl`,
    `audioUrl`,
    `thumbnailUrl`,
    `resultData`,
    `extractedImages`,
    `generatedAt`,
    `wanjuanSelectedReferenceSourceIds`,
  ].forEach((field) => {
    delete cloned[field];
  });
  if (!options.keepContextResources) delete cloned.selectedContextResources;
  return cloned;
}

/**
 * 基于提示词判断一个已完成的视频任务是否匹配某节点（用于把结果回填到节点）。
 * 校验任务有效性、项目归属、prompt 一致、节点绑定，再按节点类型与 provider/model 做匹配。
 */
export function wanjuanVideoTaskMatchesNodeByPrompt(
  task: WanjuanVideoTask | null | undefined,
  node: WanjuanNode | null | undefined,
  prompt: string | null | undefined,
  projectId?: string | null,
): boolean {
  if (!task || !node || !prompt) return false;
  if (!task.id || task.status !== `completed` || !task.resultUrl || task.stoppedByUser) return false;
  if ((task.projectId || `default`) !== (projectId || `default`)) return false;
  if (String(task.prompt || ``).trim() !== String(prompt || ``).trim()) return false;
  if (task.nodeId && task.nodeId !== node.id) return false;
  if (task.nodeId === node.id) return true;
  let provider = String(task.provider || ``).toLowerCase(),
    taskModel = String(task.modelName || task.model || ``).trim(),
    nodeVideoModel = String(node.data?.videoModel || ``).trim();
  if (taskModel && nodeVideoModel && taskModel !== nodeVideoModel) return false;
  if (node.type === `seedanceNode`)
    return provider === `seedance` || /seedance|doubao/i.test(taskModel);
  if (node.type === `tongyiWanxiangNode`)
    return provider === `tongyi-wanxiang` || /wanx|wan\d|tongyi/i.test(taskModel);
  if (node.type === `videoNode`)
    return (task.type === `video` || task.customOutputType === `video`) &&
      provider !== `seedance` &&
      provider !== `tongyi-wanxiang` &&
      !/seedance|doubao|wanx|wan\d|tongyi/i.test(taskModel);
  return false;
}

/**
 * 判断一个视频任务能否附着到某节点（不强制 prompt 一致、不要求任务已完成）。
 * 用于把进行中/已存在的任务关联到节点，按项目归属、节点绑定及节点类型与 provider/model 匹配。
 */
export function wanjuanVideoTaskCanAttachToNode(
  task: WanjuanVideoTask | null | undefined,
  node: WanjuanNode | null | undefined,
  projectId?: string | null,
): boolean {
  if (!task || !node || !task.id || task.stoppedByUser) return false;
  if ((task.projectId || `default`) !== (projectId || `default`)) return false;
  if (task.nodeId && task.nodeId !== node.id) return false;
  if (task.nodeId === node.id) return true;
  let provider = String(task.provider || ``).toLowerCase(),
    taskModel = String(task.modelName || task.model || ``).trim(),
    nodeVideoModel = String(node.data?.videoModel || ``).trim();
  if (taskModel && nodeVideoModel && taskModel !== nodeVideoModel) return false;
  if (node.type === `seedanceNode`)
    return provider === `seedance` || /seedance|doubao/i.test(taskModel);
  if (node.type === `tongyiWanxiangNode`)
    return provider === `tongyi-wanxiang` || /wanx|wan\d|tongyi/i.test(taskModel);
  if (node.type === `videoNode`)
    return (task.type === `video` || task.customOutputType === `video`) &&
      provider !== `seedance` &&
      provider !== `tongyi-wanxiang` &&
      !/seedance|doubao|wanx|wan\d|tongyi/i.test(taskModel);
  return false;
}

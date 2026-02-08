/**
 * Publisher 策略接口定义
 *
 * 所有发布策略（api, browser, remote）都实现此接口。
 */

export interface ImageInfo {
  placeholder: string;
  localPath: string;
  originalPath: string;
}

export interface PublishOptions {
  /** 文章标题 */
  title: string;
  /** 作者 */
  author?: string;
  /** 摘要 */
  summary?: string;
  /** 转换后的 HTML 文件路径 */
  htmlFilePath: string;
  /** 封面图路径 */
  coverPath: string;
  /** 文章中的图片列表（用于浏览器模式） */
  contentImages?: ImageInfo[];
  /** 是否提交为草稿 */
  submit?: boolean;
  /** 主题 */
  theme?: string;
}

export interface PublishResult {
  success: boolean;
  mediaId?: string;
  message: string;
}

export interface Publisher {
  /** 策略名 */
  readonly name: string;
  /** 执行发布 */
  publish(options: PublishOptions): Promise<PublishResult>;
}

export type PublishMethod = 'api' | 'browser' | 'remote';

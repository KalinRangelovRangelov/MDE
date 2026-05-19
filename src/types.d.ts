declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  interface TaskListOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: (md: MarkdownIt, options?: TaskListOptions) => void;
  export default plugin;
}

declare module "*.css?inline" {
  const css: string;
  export default css;
}

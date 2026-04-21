import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownReportProps {
  content: string;
  sessionDir?: string;
}

export function MarkdownReport({ content, sessionDir }: MarkdownReportProps) {
  // Transform relative image paths to file:// URLs for Electron
  const processedContent = sessionDir
    ? content.replace(
        /!\[([^\]]*)\]\((?!https?:\/\/|file:\/\/)([^)]+)\)/g,
        (_, alt, src) => `![${alt}](file:///${sessionDir.replace(/\\/g, '/')}/${src})`
      )
    : content;

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-bold prose-headings:tracking-tight
      prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
      prose-table:text-xs prose-table:border prose-table:border-border
      prose-th:bg-muted/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:border prose-th:border-border
      prose-td:px-3 prose-td:py-2 prose-td:border prose-td:border-border
      prose-img:rounded-xl prose-img:shadow-md prose-img:max-w-full
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-code:text-xs prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

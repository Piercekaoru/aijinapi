type StaticHtmlPageProps = {
  style: string;
  html: string;
};

export function StaticHtmlPage({ style, html }: StaticHtmlPageProps) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: style }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}

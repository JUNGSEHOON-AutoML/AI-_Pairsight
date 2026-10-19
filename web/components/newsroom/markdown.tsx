/** Deliberately small Markdown subset. React escapes content; HTML, remote images and scripts never execute. */
export function MarkdownDocument({text}:{text:string}) {
 const body=text.replace(/^---\n[^\n]+\n---\n\n/,"");
 return <div className="desk-document">{body.split("\n").map((line,i)=>line.startsWith("# ")?<h2 key={i}>{line.slice(2)}</h2>:line.startsWith("## ")?<h3 key={i}>{line.slice(3)}</h3>:line.startsWith("- ")?<p className="document-item" key={i}>{line.slice(2)}</p>:line.trim()?<p key={i}>{line}</p>:null)}</div>;
}

import path from 'path';
import { ingestArticleImage } from '../src/lib/article-image-ingest';

async function main() {
  const args = process.argv.slice(2);
  const replace = args.includes('--replace');
  const [url, slug, ...rest] = args.filter(arg => arg !== '--replace');
  if (!url || !slug || rest.length > 0 || url.startsWith('--') || slug.startsWith('--')) {
    console.error('usage: tsx scripts/add-article-image.ts <image-url> <article-slug> [--replace]');
    process.exitCode = 2;
    return;
  }
  const result = await ingestArticleImage({
    url,
    slug,
    publicDir: path.join(process.cwd(), 'public'),
    replace,
  });
  console.error(
    `wrote ${path.relative(process.cwd(), result.file)} (${result.width}x${result.height}, ${result.bytes} bytes, quality ${result.quality})`,
  );
  console.error('fill in every empty field from the source page, then delete the optional ones you do not need:');
  console.log(result.stub);
}

main().catch((error: unknown) => {
  console.error(`add-article-image: ${(error as Error).message}`);
  process.exitCode = 1;
});

import path from 'path';
import { ingestArticleImage } from '../src/lib/article-image-ingest';

async function main() {
  const [url, slug] = process.argv.slice(2);
  if (!url || !slug || process.argv.length > 4) {
    console.error('usage: tsx scripts/add-article-image.ts <image-url> <article-slug>');
    process.exitCode = 2;
    return;
  }
  const result = await ingestArticleImage({
    url,
    slug,
    publicDir: path.join(process.cwd(), 'public'),
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

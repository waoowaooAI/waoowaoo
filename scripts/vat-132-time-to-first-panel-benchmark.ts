import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  renderVat132BenchmarkMarkdown,
  summarizeVat132Benchmarks,
  type Vat132BenchmarkPair,
} from '@/lib/workspace/vat-132-benchmark'

interface CliArgs {
  input: string
  outputJson?: string
  outputMd?: string
  targetImprovementPct: number
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)

  const getArg = (name: string) => {
    const equalsForm = args.find((arg) => arg.startsWith(`--${name}=`))
    if (equalsForm) return equalsForm.split('=').slice(1).join('=')

    const flagIndex = args.findIndex((arg) => arg === `--${name}`)
    if (flagIndex >= 0) {
      return args[flagIndex + 1]
    }

    return undefined
  }

  const input = getArg('input')
  if (!input) {
    throw new Error('Missing required --input=<path>')
  }

  const outputJson = getArg('output-json')
  const outputMd = getArg('output-md')
  const rawTarget = getArg('target-improvement-pct')
  const targetImprovementPct = rawTarget ? Number(rawTarget) : 30

  return {
    input,
    outputJson,
    outputMd,
    targetImprovementPct: Number.isFinite(targetImprovementPct) ? targetImprovementPct : 30,
  }
}

async function main() {
  const cli = parseArgs()
  const inputPath = resolve(cli.input)
  const raw = await readFile(inputPath, 'utf8')
  const pairs = JSON.parse(raw) as Vat132BenchmarkPair[]
  const summary = summarizeVat132Benchmarks(pairs, cli.targetImprovementPct)

  if (cli.outputJson) {
    await writeFile(resolve(cli.outputJson), JSON.stringify(summary, null, 2) + '\n', 'utf8')
  }

  if (cli.outputMd) {
    await writeFile(resolve(cli.outputMd), renderVat132BenchmarkMarkdown(summary) + '\n', 'utf8')
  }

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
}

main().catch((error) => {
  console.error('[VAT-132 benchmark] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})

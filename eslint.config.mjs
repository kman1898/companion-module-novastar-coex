// Flat config from @companion-module/tools.
import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const base = await generateEslintConfig({ ignores: ['test/fixtures/**'] })

export default [
	...base,
	{
		// The tools config assumes CommonJS for .js; this module is ESM ("type": "module").
		files: ['**/*.js'],
		languageOptions: { sourceType: 'module', ecmaVersion: 'latest' },
	},
]

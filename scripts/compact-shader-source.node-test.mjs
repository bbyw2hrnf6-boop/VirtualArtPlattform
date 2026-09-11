import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ShaderChunk } from 'three';
import { compactShaderSource, compactInstalledShader, compactThreeShaderStrings } from './lib/compact-shader-source.mjs';

// Independent lexer: compare actual GLSL tokens, including multi-character
// operators and complete numeric literals, rather than whitespace alone.
const tokens = (source) => source.match(/0[xX][\da-fA-F]+[uU]?|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[uUfF]?|[A-Za-z_]\w*|<<=|>>=|\+\+|--|&&|\|\||\^\^|==|!=|<=|>=|<<|>>|[+*/%&|^=-]=|[^\s]/g);
const directives = (source) => source.split('\n')
  .filter((line) => /^\s*#/.test(line))
  .map((line) => line.trim());

test('every installed Three shader retains its tokens and preprocessor directives', () => {
  assert.ok(Object.keys(ShaderChunk).length >= 100);
  for (const [name, source] of Object.entries(ShaderChunk)) {
    const compact = compactShaderSource(source);
    assert.deepEqual(tokens(compact), tokens(source), name);
    assert.deepEqual(directives(compact), directives(source), name);
  }
});

test('macro continuation, separated operators and scientific notation survive', () => {
  const source = '#define SAMPLE(x) \\\n  ((x) + 1.0)\nfloat a = 1.5e-3;\na = a + +a;\n';
  const compact = compactShaderSource(source);
  assert.ok(compact.startsWith('#define SAMPLE(x) \\\n((x) + 1.0)\n'));
  assert.deepEqual(tokens(compact), tokens(source));
  for (const sensitive of ['a; // comment\nb;', '/* comment */\na;', 'int n = __LINE__;', '#include "custom"']) {
    assert.equal(compactShaderSource(sensitive), sensitive);
  }
});

test('the build transform changes only recognized shader string literals', () => {
  const source = readFileSync(new URL('../node_modules/three/build/three.module.js', import.meta.url), 'utf8');
  const compact = compactThreeShaderStrings(source);
  const mask = (code, transform) => {
    for (const value of new Set(Object.values(ShaderChunk))) {
      code = code.replaceAll(JSON.stringify(transform(value)), '"SHADER"');
    }
    return code;
  };
  assert.ok(compact.length < source.length);
  assert.equal(mask(compact, compactInstalledShader), mask(source, (value) => value));
});

// Tokenize comments as complete lexemes independently from the compactor.
const glslTokens = source => (source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|0[xX][\da-fA-F]+[uU]?|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[uUfF]?|[A-Za-z_]\w*|<<=|>>=|\+\+|--|&&|\|\||\^\^|==|!=|<=|>=|<<|>>|[+*/%&|^=-]=|[^\s]/g) ?? []).filter(token => !token.startsWith('//') && !token.startsWith('/*'));
test('installed shader compaction preserves every executable GLSL token', () => {
  for (const [name, shader] of Object.entries(ShaderChunk)) {
    assert.deepEqual(glslTokens(compactInstalledShader(shader)), glslTokens(shader), name);
  }
  for (const source of ['float/**/x = 1.; // note\nx = x + +x;', '#define FOO(x) \\\n ((x) /* note */ + 1.)\nfloat a = 2.;'])
    assert.deepEqual(glslTokens(compactInstalledShader(source)), glslTokens(source));
});

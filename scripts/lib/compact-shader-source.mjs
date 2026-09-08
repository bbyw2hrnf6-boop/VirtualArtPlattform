import { ShaderChunk } from 'three';

export function compactShaderSource(source) {
  // Leave comments, line-sensitive shaders and string-bearing directives alone.
  if (/\/\/|\/\*|__LINE__|["']/.test(source)) return source;
  const output = [];
  let block = [];
  let continued = false;
  const flush = () => {
    if (block.length) output.push(block.join(' ').trim().replace(
      /(\S)\s+(?=\S)/g,
      (gap, left, index, text) => {
        const right = text[index + gap.length];
        const words = /[\w.]/.test(left) && /[\w.]/.test(right);
        const operators = /[+*/<>=!&|%^-]/.test(left) && /[+*/<>=!&|%^-]/.test(right);
        return left + (words || operators ? ' ' : '');
      },
    ));
    block = [];
  };
  for (const line of source.split('\n')) {
    if (/^\s*#/.test(line) || continued) {
      flush();
      output.push(line);
      continued = line.trimEnd().endsWith('\\');
    } else block.push(line.trim());
  }
  flush();
  return output.join('\n');
}

export function compactThreeShaderStrings(code) {
  for (const shader of new Set(Object.values(ShaderChunk))) {
    code = code.replaceAll(JSON.stringify(shader), JSON.stringify(compactShaderSource(shader)));
  }
  return code;
}

/** @returns {import('vite').Plugin} */
export function compactThreeShaders() {
  return {
    name: 'compact-three-shader-whitespace',
    apply: 'build',
    transform(code, id) {
      if (!/node_modules[\\/]three[\\/]build[\\/]three\.module\.js$/.test(id)) return null;
      return { code: compactThreeShaderStrings(code), map: null };
    },
  };
}

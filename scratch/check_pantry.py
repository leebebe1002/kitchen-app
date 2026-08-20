import re
import json

with open('web/src/views/PantryView.js', 'r', encoding='utf-8') as f:
    text = f.read()

idx1 = text.find('return {')
idx2 = text.find('};', idx1)
setup_str = text[idx1:idx2]
returns = set(re.findall(r'([a-zA-Z0-9_]+)\s*[,:]', setup_str))

print('Returned keys count:', len(returns))

# 抓取 template
t_idx1 = text.find('template: `') + len('template: `')
t_idx2 = text.rfind('`')
template_str = text[t_idx1:t_idx2]

# 檢查 {{ ... }}
interpolations = re.findall(r'\{\{\s*([^}]+)\s*\}\}', template_str)
for interp in interpolations:
    tokens = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', interp)
    for tok in tokens:
        if tok not in returns and tok not in ['item', 'store', 'cat', 'zone', 'dish', 'index', 'true', 'false', 'null', 'undefined', 'Math', 'Date', 'String', 'Number', 'Array', 'Object']:
            print('MISSING INTERPOLATION TOKEN:', tok, 'in {{', interp, '}}')

# 檢查 @click, v-if, v-for, :style, :class 等
directives = re.findall(r'(?:@|v-|:)[a-zA-Z0-9_\-\.]+\s*=\s*"([^"]+)"', template_str)
for direct in directives:
    tokens = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', direct)
    for tok in tokens:
        if tok not in returns and tok not in ['item', 'store', 'cat', 'zone', 'dish', 'index', 'true', 'false', 'null', 'undefined', 'event', '$event', 'Math', 'Date', 'String', 'Number', 'Array', 'Object']:
            print('MISSING DIRECTIVE TOKEN:', tok, 'in directive [', direct, ']')

print('Check complete!')

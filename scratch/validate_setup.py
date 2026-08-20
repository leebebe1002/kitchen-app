import re

with open('web/src/views/PantryView.js', 'r', encoding='utf-8') as f:
    text = f.read()

setup_str = text.split('setup(')[1].split('template: `')[0]

ret_match = re.search(r'return\s*\{([^}]+)\};', setup_str)
ret_keys = [k.strip() for k in ret_match.group(1).split(',') if k.strip()]

declared = set(re.findall(r'(?:const|let|var|function)\s+([a-zA-Z0-9_]+)', setup_str))
declared.update(['props', 'context', 'Vue', 'ref', 'computed', 'watch', 'onMounted'])

print(f'Total returned keys: {len(ret_keys)}')
errors = 0
for k in ret_keys:
    if k not in declared:
        print(f'UNDECLARED RETURN KEY: {k}')
        errors += 1

if errors == 0:
    print('ALL RETURNED KEYS ARE PERFECTLY DECLARED AND VALID!')

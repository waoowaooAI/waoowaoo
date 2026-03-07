#!/usr/bin/env python3
"""
提取React/TypeScript代码中的硬编码中文字符串
"""
import re
import os
from pathlib import Path
import json

def extract_chinese_strings(file_path):
    """提取文件中的中文字符串"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except:
        return []
    
    results = []
    
    # 匹配JSX/TSX中的中文字符串
    # 1. {' 中文 '} 或 {"中文"}
    pattern1 = r'\{\s*[\'"]([^\'"\{\}]*[\u4e00-\u9fff]+[^\'"\{\}]*)[\'\"]\s*\}'
    # 2. >中文< 
    pattern2 = r'\>([^<\>]*[\u4e00-\u9fff]+[^<\>]*)\<'
    # 3. placeholder="中文" 等属性
    pattern3 = r'(?:placeholder|title|alt|value|defaultValue|confirmText|cancelText|message)\s*=\s*[\'"]([^\'\"]*[\u4e00-\u9fff]+[^\'\"]*)[\'"]'
    # 4. 字符串默认值 = '中文'
    pattern4 = r'=\s*[\'"]([^\'\"]*[\u4e00-\u9fff]+[^\'\"]*)[\'"]'
    
    for pattern in [pattern1, pattern2, pattern3, pattern4]:
        matches = re.finditer(pattern, content)
        for match in matches:
            chinese_text = match.group(1).strip()
            if chinese_text and len(chinese_text) > 0:
                # 跳过注释
                line_num = content[:match.start()].count('\n') + 1
                line = content.split('\n')[line_num - 1]
                if '//' in line and line.index('//') < line.find(chinese_text):
                    continue
                results.append({
                    'text': chinese_text,
                    'line': line_num,
                    'category': 'unknown'
                })
    
    # 去重
    seen = set()
    unique_results = []
    for r in results:
        key = f"{r['text']}_{r['line']}"
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    
    return unique_results

def scan_directory(base_path,exclude_patterns=['test-ui']):
    """扫描目录中的所有TSX/TS文件"""
    all_findings = {}
    
    for root, dirs, files in os.walk(base_path):
        # 排除特定目录
        dirs[:] = [d for d in dirs if d not in exclude_patterns and not d.startswith('.')]
        
        for file in files:
            if file.endswith(('.tsx', '.ts')):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, base_path)
                
                findings = extract_chinese_strings(file_path)
                if findings:
                    all_findings[relative_path] = findings
    
    return all_findings

if __name__ == '__main__':
    base_dir = 'src'
    results = scan_directory(base_dir)
    
    # 输出结果
    total = 0
    for file_path, findings in sorted(results.items()):
        if findings:
            print(f"\n## {file_path} ({len(findings)} strings)")
            for finding in findings[:10]:  # 只显示前10个
                print(f"  Line {finding['line']}: {finding['text'][:60]}")
            total += len(findings)
            if len(findings) > 10:
                print(f"  ... and {len(findings) - 10} more")
    
    print(f"\n\n总计: {len(results)} 个文件, {total} 处硬编码中文")

#!/usr/bin/env python3
"""
GRSAI Gemini 兼容层模型测试脚本 (并行版本)
测试所有 nano-banana 模型在 Gemini 兼容层下的表现
"""

import requests
import json
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

API_KEY = "sk-c8846cb8d4834db087f0126466bf1358"
BASE_URL = "https://grsai.dakka.com.cn"

MODELS = [
    "nano-banana-fast",
    "nano-banana",
    "nano-banana-pro",
    "nano-banana-pro-vt",
    "nano-banana-pro-cl",
    "nano-banana-pro-vip",
    "nano-banana-pro-4k-vip",
]

def test_model(model_name):
    """测试单个模型"""
    url = f"{BASE_URL}/v1beta/models/{model_name}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-goog-api-key": API_KEY
    }
    payload = {
        "contents": [{"parts": [{"text": "一只可爱的小猫"}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"]
        }
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=180)
        elapsed = time.time() - start_time
        
        if response.status_code != 200:
            return model_name, False, f"HTTP {response.status_code}: {response.text[:50]}", elapsed
        
        data = response.json()
        
        if "error" in data:
            return model_name, False, f"错误: {data['error'].get('message', str(data['error']))[:50]}", elapsed
        
        if "candidates" in data and data["candidates"]:
            parts = data["candidates"][0].get("content", {}).get("parts", [])
            for part in parts:
                if "inlineData" in part:
                    base64_data = part["inlineData"].get("data", "")
                    if len(base64_data) > 100:
                        kb_size = len(base64_data) * 3 // 4 // 1024
                        return model_name, True, f"base64: {len(base64_data)} 字符 (~{kb_size} KB)", elapsed
                    else:
                        return model_name, False, f"数据异常: \"{base64_data}\" (仅 {len(base64_data)} 字符)", elapsed
                elif "text" in part:
                    return model_name, False, f"返回文本: {part['text'][:30]}...", elapsed
        
        return model_name, False, "未知响应格式", elapsed
        
    except requests.exceptions.Timeout:
        return model_name, False, "请求超时 (>180s)", time.time() - start_time
    except Exception as e:
        return model_name, False, f"异常: {str(e)[:50]}", time.time() - start_time

def main():
    print("=" * 60)
    print("GRSAI Gemini 兼容层模型测试 (并行)")
    print("=" * 60)
    print(f"测试 {len(MODELS)} 个模型，所有模型同时请求...\n")
    
    results = {}
    start_total = time.time()
    
    # 并行执行所有测试
    with ThreadPoolExecutor(max_workers=len(MODELS)) as executor:
        futures = {executor.submit(test_model, model): model for model in MODELS}
        
        for future in as_completed(futures):
            model_name, success, message, elapsed = future.result()
            status = "✅" if success else "❌"
            print(f"  {status} {model_name:<25} | {elapsed:>5.1f}s | {message}")
            results[model_name] = (success, message, elapsed)
    
    total_time = time.time() - start_total
    
    print("\n" + "=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    success_count = sum(1 for s, _, _ in results.values() if s)
    
    # 按原始顺序显示
    for model in MODELS:
        if model in results:
            success, message, elapsed = results[model]
            status = "✅" if success else "❌"
            print(f"  {status} {model}")
    
    print("-" * 60)
    print(f"  成功: {success_count}/{len(MODELS)} | 总耗时: {total_time:.1f}s")
    print("=" * 60)

if __name__ == "__main__":
    main()

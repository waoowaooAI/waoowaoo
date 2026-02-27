#!/usr/bin/env python3
"""
GRSAI 原生 REST API 模型测试脚本 (并行版本)
使用 /v1/draw/nano-banana 端点测试所有模型
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
    """测试单个模型 - 使用原生 REST API"""
    url = f"{BASE_URL}/v1/draw/nano-banana"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    }
    payload = {
        "model": model_name,
        "prompt": "一只可爱的小猫",
        "aspectRatio": "1:1",
        "imageSize": "1K",
        "shutProgress": True  # 关闭进度，等待最终结果
    }
    
    start_time = time.time()
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=300, stream=True)
        
        if response.status_code != 200:
            elapsed = time.time() - start_time
            return model_name, False, f"HTTP {response.status_code}: {response.text[:50]}", elapsed
        
        # 解析流式响应，获取最后一条数据
        last_data = None
        for line in response.iter_lines():
            if line:
                line_str = line.decode('utf-8')
                if line_str.startswith('data: '):
                    try:
                        json_str = line_str[6:]  # 去掉 "data: " 前缀
                        last_data = json.loads(json_str)
                    except:
                        pass
        
        elapsed = time.time() - start_time
        
        if not last_data:
            return model_name, False, "无响应数据", elapsed
        
        status = last_data.get("status", "")
        
        if status == "succeeded":
            results = last_data.get("results", [])
            if results and results[0].get("url"):
                url = results[0]["url"]
                return model_name, True, f"成功! URL: {url[:50]}...", elapsed
            return model_name, False, "成功但无图片URL", elapsed
        
        elif status == "failed":
            reason = last_data.get("failure_reason", "")
            error = last_data.get("error", "")
            return model_name, False, f"失败: {reason} - {error[:30]}", elapsed
        
        else:
            return model_name, False, f"未知状态: {status}", elapsed
        
    except requests.exceptions.Timeout:
        return model_name, False, "请求超时 (>300s)", time.time() - start_time
    except Exception as e:
        return model_name, False, f"异常: {str(e)[:50]}", time.time() - start_time

def main():
    print("=" * 70)
    print("GRSAI 原生 REST API 模型测试 (/v1/draw/nano-banana)")
    print("=" * 70)
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
    
    print("\n" + "=" * 70)
    print("测试结果汇总")
    print("=" * 70)
    
    success_count = sum(1 for s, _, _ in results.values() if s)
    
    # 按原始顺序显示
    for model in MODELS:
        if model in results:
            success, message, elapsed = results[model]
            status = "✅" if success else "❌"
            print(f"  {status} {model}")
    
    print("-" * 70)
    print(f"  成功: {success_count}/{len(MODELS)} | 总耗时: {total_time:.1f}s")
    print("=" * 70)

if __name__ == "__main__":
    main()

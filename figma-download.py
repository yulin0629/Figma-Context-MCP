#!/usr/bin/env python3
"""
Figma 資料下載工具 (figma-download.py) - 獨立版本
==================================================

這個腳本用於下載 Figma 設計資料，並將其轉換為簡化格式。
此為完全獨立的版本，不依賴任何其他專案，可直接在任何 Python 環境中使用。

功能特點：
- 自動解析 Figma URL，提取 file key 和 node ID
- 預設下載智能精簡資料（移除重複表格行、優化樣式）
- 支援下載原始 API 回應（使用 --raw 選項）
- 支援 JSON 和 YAML 兩種輸出格式（預設 YAML，對 LLM 更友好）
- 自動從 .env 檔案讀取 FIGMA_API_KEY
- 可自訂輸出目錄和檔名
- 深度控制：結合 API depth 參數和客戶端精簡，雙重優化
- 深度分析模式：幫助決定最佳深度設定
- 顯示下載資料的統計摘要

使用範例：
    # 基本使用（自動讀取 .env 中的 API key，預設精簡模式，輸出 YAML）
    ./figma-download.py 'https://www.figma.com/design/xxx/yyy?node-id=123-456'
    
    # 先分析深度分布，決定適當的深度限制
    ./figma-download.py 'URL' --analyze
    
    # 根據分析結果設定深度限制
    ./figma-download.py 'URL' -d 3
    
    # 指定輸出目錄和格式（改為 JSON）
    ./figma-download.py 'URL' -o ./data -f json
    
    # 下載原始資料（未處理）
    ./figma-download.py 'URL' --raw
    
    # 自訂檔名
    ./figma-download.py 'URL' -n "my-design"
    
    # 使用其他 API key
    ./figma-download.py 'URL' -k "YOUR_API_KEY"
    
    # 指定自訂 .env 檔案
    ./figma-download.py 'URL' -e ./config/.env

環境設定：
    1. 在專案根目錄建立 .env 檔案
    2. 加入一行：FIGMA_API_KEY=your_figma_api_key
    3. API key 可從 Figma 設定中取得：https://www.figma.com/settings

輸出檔案命名規則：
    - 精簡資料（預設）：{file_key}_node-{node_id}_simplified_{timestamp}.{format}
    - 原始資料：{file_key}_node-{node_id}_raw_{timestamp}.{format}
    - 自訂名稱：{custom_name}.{format}

依賴需求：
    - Python 3.6+
    - requests 函式庫
    - PyYAML 函式庫
    
安裝依賴：
    pip install requests pyyaml

作者：Figma-Context-MCP
授權：MIT License
"""

import os
import sys
import json
import argparse
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import re

# 第三方套件
try:
    import requests
except ImportError:
    print("錯誤: 請先安裝 requests 套件")
    print("執行: pip install requests")
    sys.exit(1)

try:
    import yaml
except ImportError:
    print("錯誤: 請先安裝 PyYAML 套件")
    print("執行: pip install pyyaml")
    sys.exit(1)

def parse_figma_url(url):
    """解析 Figma URL 提取 file key 和 node ID"""
    try:
        parsed = urlparse(url)
        path_parts = parsed.path.split('/')
        
        # 找到 file key
        file_key = None
        for i, part in enumerate(path_parts):
            if part in ['design', 'file'] and i + 1 < len(path_parts):
                file_key = path_parts[i + 1]
                break
        
        if not file_key:
            raise ValueError("無法從 URL 中找到 file key")
        
        # 提取 node ID
        query_params = parse_qs(parsed.query)
        node_id = query_params.get('node-id', [None])[0]
        
        # 將 node-id 格式轉換為 API 格式 (2043-23350 -> 2043:23350)
        if node_id:
            node_id = node_id.replace('-', ':')
        
        return file_key, node_id
    
    except Exception as e:
        raise ValueError(f"無效的 Figma URL: {str(e)}")

def load_env_file(env_path=None):
    """載入環境變數檔案"""
    if env_path:
        env_file = Path(env_path)
    else:
        # 預設載入專案根目錄的 .env
        env_file = Path(__file__).parent / '.env'
    
    if env_file.exists():
        with open(env_file, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    # 移除引號
                    value = value.strip().strip('"').strip("'")
                    os.environ[key] = value
        return True
    return False

# === Figma 資料簡化處理邏輯 ===

def to_rgba_str(color, opacity=1.0):
    """將 Figma 顏色物件轉換為 CSS rgba 字串"""
    r = int(color.get('r', 0) * 255)
    g = int(color.get('g', 0) * 255)
    b = int(color.get('b', 0) * 255)
    a = round(color.get('a', 1.0) * opacity, 2)
    return f"rgba({r}, {g}, {b}, {a})"

def to_hex_str(color):
    """將 Figma 顏色物件轉換為 CSS hex 字串"""
    r = int(color.get('r', 0) * 255)
    g = int(color.get('g', 0) * 255)
    b = int(color.get('b', 0) * 255)
    return f"#{r:02x}{g:02x}{b:02x}"

def parse_paint(paint):
    """解析 Figma paint 物件"""
    if not paint.get('visible', True):
        return None
        
    paint_type = paint.get('type')
    
    if paint_type == 'SOLID':
        color = paint.get('color', {})
        opacity = paint.get('opacity', 1.0)
        # 如果透明度為 1，回傳 hex，否則回傳 rgba
        if round(color.get('a', 1.0) * opacity, 2) == 1.0:
            return to_hex_str(color)
        return to_rgba_str(color, opacity)
    
    elif paint_type == 'GRADIENT_LINEAR':
        return {
            'type': 'linear-gradient',
            'gradientHandlePositions': paint.get('gradientHandlePositions'),
            'gradientStops': paint.get('gradientStops')
        }
    
    elif paint_type == 'IMAGE':
        return {
            'type': 'image',
            'scaleMode': paint.get('scaleMode'),
            'imageRef': paint.get('imageRef')
        }
    
    # 其他類型的 paint
    return {'type': paint_type}

def simplify_layout(node):
    """簡化節點的布局資訊"""
    layout = {}
    
    # 布局模式
    layout_mode = node.get('layoutMode', 'NONE')
    mode_map = {
        'NONE': 'none',
        'HORIZONTAL': 'row',
        'VERTICAL': 'column'
    }
    layout['mode'] = mode_map.get(layout_mode, 'none')
    
    # 對齊方式
    align_map = {
        'MIN': 'flex-start',
        'MAX': 'flex-end',
        'CENTER': 'center',
        'SPACE_BETWEEN': 'space-between',
        'SPACE_AROUND': 'space-around',
        'SPACE_EVENLY': 'space-evenly'
    }
    
    if 'primaryAxisAlignItems' in node:
        layout['justifyContent'] = align_map.get(node['primaryAxisAlignItems'])
    
    if 'counterAxisAlignItems' in node:
        layout['alignItems'] = align_map.get(node['counterAxisAlignItems'])
    
    # 間距
    if node.get('itemSpacing', 0) > 0:
        layout['gap'] = f"{node['itemSpacing']}px"
    
    # 內距
    padding_values = {
        'top': node.get('paddingTop', 0),
        'right': node.get('paddingRight', 0),
        'bottom': node.get('paddingBottom', 0),
        'left': node.get('paddingLeft', 0)
    }
    
    if any(padding_values.values()):
        if all(v == padding_values['top'] for v in padding_values.values()):
            layout['padding'] = f"{padding_values['top']}px"
        else:
            layout['padding'] = f"{padding_values['top']}px {padding_values['right']}px {padding_values['bottom']}px {padding_values['left']}px"
    
    # 尺寸設定
    sizing_map = {
        'FIXED': 'fixed',
        'FILL': 'fill',
        'HUG': 'hug',
        'INHERIT': 'inherit'
    }
    
    if 'layoutSizingHorizontal' in node:
        layout['horizontalSizing'] = sizing_map.get(node['layoutSizingHorizontal'], 'fixed')
    
    if 'layoutSizingVertical' in node:
        layout['verticalSizing'] = sizing_map.get(node['layoutSizingVertical'], 'fixed')
    
    # 位置和尺寸
    if 'absoluteBoundingBox' in node:
        box = node['absoluteBoundingBox']
        layout['position'] = {
            'x': round(box.get('x', 0), 2),
            'y': round(box.get('y', 0), 2)
        }
        layout['size'] = {
            'width': round(box.get('width', 0), 2),
            'height': round(box.get('height', 0), 2)
        }
    
    return layout

def simplify_text_style(style):
    """簡化文字樣式"""
    return {
        'fontFamily': style.get('fontFamily'),
        'fontWeight': style.get('fontWeight'),
        'fontSize': style.get('fontSize'),
        'letterSpacing': style.get('letterSpacing'),
        'lineHeightPx': style.get('lineHeightPx'),
        'textAlignHorizontal': style.get('textAlignHorizontal'),
        'textAlignVertical': style.get('textAlignVertical'),
        'textCase': style.get('textCase'),
        'textDecoration': style.get('textDecoration')
    }

def simplify_effect(effect):
    """簡化效果（陰影、模糊等）"""
    effect_type = effect.get('type')
    
    if effect_type in ['DROP_SHADOW', 'INNER_SHADOW']:
        return {
            'type': effect_type,
            'color': to_rgba_str(effect.get('color', {})),
            'offset': {
                'x': effect.get('offset', {}).get('x', 0),
                'y': effect.get('offset', {}).get('y', 0)
            },
            'radius': effect.get('radius', 0),
            'spread': effect.get('spread', 0) if effect_type == 'DROP_SHADOW' else None,
            'visible': effect.get('visible', True)
        }
    
    elif effect_type == 'LAYER_BLUR':
        return {
            'type': effect_type,
            'radius': effect.get('radius', 0),
            'visible': effect.get('visible', True)
        }
    
    return {'type': effect_type}

def generate_unique_id(prefix, counter):
    """生成唯一 ID"""
    counter['value'] += 1
    return f"{prefix}_{counter['value']:06X}"

def _get_table_row_signature(node):
    """獲取表格行的特徵簽名，用於識別重複模式"""
    signature_parts = []
    
    # 遞迴提取所有文字內容
    def extract_texts(n):
        if n.get('type') == 'TEXT':
            text = n.get('characters', '').strip()
            if text:
                signature_parts.append(text)
        for child in n.get('children', []):
            extract_texts(child)
    
    extract_texts(node)
    
    # 生成簽名：如果沒有文字，使用節點結構
    if signature_parts:
        return '_'.join(sorted(signature_parts))
    else:
        # 使用節點的結構特徵
        return f"empty_{node.get('name', 'unnamed')}"

def find_or_create_style(styles_map, value, prefix, counter):
    """尋找或建立樣式變數"""
    # 將值轉換為穩定的字串表示
    value_str = json.dumps(value, sort_keys=True)
    
    # 檢查是否已存在
    if value_str in styles_map['lookup']:
        style_id = styles_map['lookup'][value_str]
        # 更新使用次數
        styles_map['usage_count'][style_id] = styles_map['usage_count'].get(style_id, 0) + 1
        return style_id
    
    # 建立新的樣式 ID
    style_id = generate_unique_id(prefix, counter)
    styles_map['styles'][style_id] = value
    styles_map['lookup'][value_str] = style_id
    styles_map['usage_count'][style_id] = 1
    
    return style_id

def simplify_node(node, styles_map, counter, depth=0, parent_type=None, max_depth=None, table_counters=None):
    """簡化單個節點"""
    if not node.get('visible', True):
        return None
    
    # 初始化表格計數器
    if table_counters is None:
        table_counters = {}
    
    # 檢查是否超過最大深度限制
    if max_depth is not None and depth > max_depth:
        return {
            'type': 'DEPTH_LIMIT',
            'name': node.get('name', ''),
            'text': f'（深度 {depth} 超過限制，省略子節點）'
        }
    
    simplified = {
        'id': node.get('id'),
        'name': node.get('name'),
        'type': node.get('type')
    }
    
    # 識別特定的容器類型
    container_type = parent_type
    node_name = node.get('name', '')
    if '表格' in node_name and '組件' in node_name:
        container_type = 'table_container'
        # 為這個表格容器創建獨立的計數器
        table_id = node.get('id', 'unknown')
        if table_id not in table_counters:
            table_counters[table_id] = {'row_count': 0, 'rows_seen': {}}
    
    # 文字內容
    if 'characters' in node:
        simplified['text'] = node['characters']
    
    # 文字樣式
    if 'style' in node and node['style']:
        text_style = simplify_text_style(node['style'])
        simplified['textStyle'] = find_or_create_style(
            styles_map, text_style, 'style', counter
        )
    
    # 填色
    if 'fills' in node and node['fills']:
        fills = []
        for fill in node['fills']:
            parsed = parse_paint(fill)
            if parsed:
                fills.append(parsed)
        if fills:
            simplified['fills'] = find_or_create_style(
                styles_map, fills[0] if len(fills) == 1 else fills, 
                'fill', counter
            )
    
    # 邊框
    if 'strokes' in node and node['strokes']:
        strokes = []
        for stroke in node['strokes']:
            parsed = parse_paint(stroke)
            if parsed:
                strokes.append(parsed)
        if strokes:
            stroke_data = {
                'color': strokes[0] if len(strokes) == 1 else strokes,
                'strokeWeight': node.get('strokeWeight', 1),
                'strokeAlign': node.get('strokeAlign', 'INSIDE')
            }
            simplified['strokes'] = find_or_create_style(
                styles_map, stroke_data, 'stroke', counter
            )
    
    # 效果
    if 'effects' in node and node['effects']:
        effects = []
        for effect in node['effects']:
            if effect.get('visible', True):
                simplified_effect = simplify_effect(effect)
                effects.append(simplified_effect)
        if effects:
            simplified['effects'] = find_or_create_style(
                styles_map, effects[0] if len(effects) == 1 else effects,
                'effect', counter
            )
    
    # 布局
    layout = simplify_layout(node)
    if layout and layout != {'mode': 'none'}:
        # 只保留重要的 layout 屬性
        important_layout = {}
        # 只保留影響外觀的屬性
        for key in ['mode', 'justifyContent', 'alignItems', 'gap', 'padding']:
            if key in layout:
                important_layout[key] = layout[key]
        if important_layout and important_layout != {'mode': 'none'}:
            simplified['layout'] = find_or_create_style(
                styles_map, important_layout, 'layout', counter
            )
    
    # 處理子節點
    if 'children' in node and node['children']:
        children = []
        
        # 如果是表格容器，使用對應的計數器
        current_table_counter = None
        if container_type == 'table_container':
            table_id = node.get('id', 'unknown')
            if table_id in table_counters:
                current_table_counter = table_counters[table_id]
        
        for i, child in enumerate(node['children']):
            child_name = child.get('name', '')
            
            # 跳過無用的中間層
            if child.get('type') == 'INSTANCE' and '表格元件' in child_name:
                # 直接提取最終內容
                if 'children' in child:
                    for grandchild in child.get('children', []):
                        if grandchild.get('type') == 'TEXT':
                            # 直接加入文字節點
                            simplified_child = simplify_node(grandchild, styles_map, counter, depth + 1, container_type, max_depth, table_counters)
                            if simplified_child:
                                children.append(simplified_child)
                            break
                continue
            
            # 識別重複的表格行模式
            if '表格群組/表身' in child_name and current_table_counter is not None:
                # 獲取表格行的內容特徵
                row_signature = _get_table_row_signature(child)
                rows_seen = current_table_counter['rows_seen']
                
                if row_signature in rows_seen:
                    rows_seen[row_signature] += 1
                    # 只保留前3個範例
                    if current_table_counter['row_count'] >= 3:
                        continue
                else:
                    rows_seen[row_signature] = 1
                    current_table_counter['row_count'] += 1
            
            simplified_child = simplify_node(child, styles_map, counter, depth + 1, container_type, max_depth, table_counters)
            if simplified_child:
                children.append(simplified_child)
        
        # 如果有大量重複的表格行，加入摘要
        if current_table_counter and current_table_counter['rows_seen']:
            total_rows = sum(current_table_counter['rows_seen'].values())
            if total_rows > 3:
                children.append({
                    'type': 'SUMMARY',
                    'name': '表格行摘要',
                    'text': f'（省略了 {total_rows - 3} 個重複的表格行）'
                })
        
        if children:
            simplified['children'] = children
    
    return simplified

def analyze_depth_distribution(node, depth=0, depth_stats=None):
    """分析節點的深度分布"""
    if depth_stats is None:
        depth_stats = {
            'max_depth': 0,
            'depth_count': {},
            'depth_nodes': {},
            'total_nodes': 0
        }
    
    # 更新統計資料
    depth_stats['total_nodes'] += 1
    depth_stats['max_depth'] = max(depth_stats['max_depth'], depth)
    
    # 計算每個深度的節點數
    if depth not in depth_stats['depth_count']:
        depth_stats['depth_count'][depth] = 0
        depth_stats['depth_nodes'][depth] = []
    
    depth_stats['depth_count'][depth] += 1
    
    # 記錄一些範例節點（最多 3 個）
    if len(depth_stats['depth_nodes'][depth]) < 3:
        node_info = {
            'name': node.get('name', 'Unnamed'),
            'type': node.get('type', 'Unknown')
        }
        depth_stats['depth_nodes'][depth].append(node_info)
    
    # 遞迴處理子節點
    if 'children' in node and node['children']:
        for child in node['children']:
            if child.get('visible', True):
                analyze_depth_distribution(child, depth + 1, depth_stats)
    
    return depth_stats

def remove_empty_values(obj):
    """遞迴移除空值"""
    if isinstance(obj, dict):
        return {
            k: remove_empty_values(v)
            for k, v in obj.items()
            if v is not None and v != [] and v != {}
        }
    elif isinstance(obj, list):
        return [
            remove_empty_values(item)
            for item in obj
            if item is not None
        ]
    return obj

def simplify_figma_response(raw_data, node_id=None, max_depth=None):
    """簡化 Figma API 回應"""
    styles_map = {
        'styles': {},
        'lookup': {},
        'usage_count': {}  # 追蹤樣式使用次數
    }
    counter = {'value': 0}
    
    result = {}
    
    if node_id and 'nodes' in raw_data:
        # 處理特定節點
        nodes_data = raw_data['nodes']
        if nodes_data:
            node_key = list(nodes_data.keys())[0]
            node_info = nodes_data[node_key]
            
            result['name'] = node_info.get('document', {}).get('name', 'Untitled')
            result['lastModified'] = raw_data.get('lastModified')
            result['thumbnailUrl'] = raw_data.get('thumbnailUrl')
            
            # 簡化節點
            document = node_info.get('document', {})
            table_counters = {}
            simplified = simplify_node(document, styles_map, counter, max_depth=max_depth, table_counters=table_counters)
            
            if simplified:
                result['nodes'] = [simplified]
    else:
        # 處理整個檔案
        result['name'] = raw_data.get('name', 'Untitled')
        result['lastModified'] = raw_data.get('lastModified')
        result['version'] = raw_data.get('version')
        result['role'] = raw_data.get('role')
        result['editorType'] = raw_data.get('editorType')
        result['thumbnailUrl'] = raw_data.get('thumbnailUrl')
        
        # 簡化文件結構
        if 'document' in raw_data:
            document = raw_data['document']
            if 'children' in document:
                nodes = []
                table_counters = {}
                for child in document['children']:
                    simplified = simplify_node(child, styles_map, counter, max_depth=max_depth, table_counters=table_counters)
                    if simplified:
                        nodes.append(simplified)
                if nodes:
                    result['nodes'] = nodes
    
    # 優化樣式
    if styles_map['styles']:
        optimized_styles = {}
        # 只保留使用次數超過閾值的樣式
        for style_id, style_value in styles_map['styles'].items():
            usage = styles_map['usage_count'].get(style_id, 0)
            # 使用次數少於3次的樣式可以內聯
            if usage >= 3 or style_id.startswith('fill_') or style_id.startswith('style_'):
                optimized_styles[style_id] = style_value
        result['styles'] = optimized_styles
    elif styles_map['styles']:
        result['styles'] = styles_map['styles']
    
    return remove_empty_values(result)

def download_figma_data(file_key, node_id=None, api_key=None, raw=False, max_depth=None):
    """下載 Figma 資料"""
    
    # 取得 API key
    api_key = api_key or os.environ.get('FIGMA_API_KEY')
    if not api_key:
        raise ValueError("FIGMA_API_KEY not found")
    
    # 建構 API URL
    url = f"https://api.figma.com/v1/files/{file_key}"
    params = []
    
    if node_id:
        url += f"/nodes"
        params.append(f"ids={node_id}")
    
    # 如果設定了深度限制，在 API 層級就限制
    # 注意：對於 nodes endpoint，depth 是從請求的節點開始計算
    if max_depth is not None and not raw:
        # API 的 depth 參數使用較寬鬆的值，確保能取得足夠資料
        # 精確的深度控制由 Python 處理
        api_depth = min(max_depth + 2, 10)  # 給予一些緩衝空間
        params.append(f"depth={api_depth}")
    
    # 添加參數到 URL
    if params:
        url += "?" + "&".join(params)
    
    # 設定 headers
    headers = {
        'X-Figma-Token': api_key
    }
    
    # 發送請求
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if raw:
            # 回傳原始資料
            return data
        else:
            # 簡化資料
            return simplify_figma_response(data, node_id, max_depth)
            
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 403:
            raise RuntimeError("Figma API 錯誤: 403 Forbidden - 請檢查 API key 是否正確")
        elif e.response.status_code == 404:
            raise RuntimeError("Figma API 錯誤: 404 Not Found - 請檢查檔案或節點 ID 是否正確")
        else:
            raise RuntimeError(f"Figma API 錯誤: {e.response.status_code} {e.response.reason}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"網路請求錯誤: {str(e)}")

def save_data(data, output_path, format='json'):
    """儲存資料到檔案"""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        if format == 'json':
            json.dump(data, f, ensure_ascii=False, indent=2)
        elif format == 'yaml':
            yaml.dump(data, f, 
                     default_flow_style=False, 
                     allow_unicode=True,
                     sort_keys=False,
                     width=1000)

def main():
    parser = argparse.ArgumentParser(
        description='下載 Figma 設計資料並處理為簡化格式',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
範例:
  %(prog)s 'https://www.figma.com/design/xxx/yyy?node-id=123-456' --analyze  # 分析深度分布
  %(prog)s 'https://www.figma.com/design/xxx/yyy?node-id=123-456'  # 預設精簡模式，輸出 YAML
  %(prog)s 'https://www.figma.com/design/xxx/yyy?node-id=123-456' -d 3  # 限制深度為 3
  %(prog)s 'https://www.figma.com/file/xxx/yyy' --raw -k YOUR_API_KEY  # 下載原始資料
        """
    )
    
    parser.add_argument('url', help='Figma 檔案或節點的 URL')
    parser.add_argument('-o', '--output', 
                       default='./figma-downloads',
                       help='輸出目錄 (預設: ./figma-downloads)')
    parser.add_argument('-f', '--format', 
                       choices=['json', 'yaml'],
                       default='yaml',
                       help='輸出格式 (預設: yaml)')
    parser.add_argument('-k', '--api-key',
                       help='Figma API key (覆蓋環境變數)')
    parser.add_argument('-r', '--raw',
                       action='store_true',
                       help='儲存原始 API 回應 (不處理)')
    parser.add_argument('-e', '--env',
                       help='自訂 .env 檔案路徑')
    parser.add_argument('-n', '--name',
                       help='自訂輸出檔名 (不含副檔名)')
    parser.add_argument('-d', '--max-depth',
                       type=int,
                       help='精簡模式的最大處理深度 (預設: 不限制)')
    parser.add_argument('-a', '--analyze',
                       action='store_true',
                       help='分析檔案結構深度分布（不下載資料）')
    
    args = parser.parse_args()
    
    try:
        # 載入環境變數
        if args.env or not os.environ.get('FIGMA_API_KEY'):
            load_env_file(args.env)
        
        # 解析 URL
        print(f"🔗 解析 Figma URL: {args.url}")
        file_key, node_id = parse_figma_url(args.url)
        print(f"📄 File Key: {file_key}")
        if node_id:
            print(f"🎯 Node ID: {node_id}")
        
        # 檢查 API key
        api_key = args.api_key or os.environ.get('FIGMA_API_KEY')
        if not api_key:
            print("\n❌ 錯誤: 找不到 FIGMA_API_KEY")
            print("請使用以下方式之一提供 API key:")
            print("1. 在 .env 檔案中設定 FIGMA_API_KEY=your_key")
            print("2. 使用 -k 參數: -k your_key")
            print("3. 設定環境變數: export FIGMA_API_KEY=your_key")
            sys.exit(1)
        
        # 分析模式
        if args.analyze:
            print(f"\n🔍 分析 Figma 檔案結構...")
            # 下載原始資料進行分析
            raw_data = download_figma_data(file_key, node_id, api_key, raw=True)
            
            # 分析深度分布
            if node_id and 'nodes' in raw_data:
                nodes_data = raw_data['nodes']
                if nodes_data:
                    node_key = list(nodes_data.keys())[0]
                    document = nodes_data[node_key].get('document', {})
                    stats = analyze_depth_distribution(document)
            else:
                document = raw_data.get('document', {})
                stats = analyze_depth_distribution(document)
            
            # 顯示分析結果
            print(f"\n📊 深度分析結果:")
            print(f"   最大深度: {stats['max_depth']}")
            print(f"   總節點數: {stats['total_nodes']}")
            print(f"\n   各深度節點分布:")
            
            cumulative_percent = 0
            for depth in sorted(stats['depth_count'].keys()):
                count = stats['depth_count'][depth]
                percent = (count / stats['total_nodes']) * 100
                cumulative_percent += percent
                print(f"   深度 {depth}: {count:4d} 個節點 ({percent:5.1f}%) [累計: {cumulative_percent:5.1f}%]")
                
                # 顯示範例節點
                if stats['depth_nodes'][depth]:
                    for example in stats['depth_nodes'][depth][:2]:
                        print(f"           例: {example['type']} - {example['name'][:30]}...")
            
            print(f"\n💡 建議:")
            # 根據分布給出建議
            if stats['max_depth'] <= 3:
                print("   檔案結構較淺，不需要設定深度限制")
            elif stats['max_depth'] <= 5:
                print("   建議深度限制: 3-4")
            else:
                # 找出包含 80% 節點的深度
                target_percent = 80
                cumulative = 0
                suggested_depth = 0
                for depth in sorted(stats['depth_count'].keys()):
                    cumulative += (stats['depth_count'][depth] / stats['total_nodes']) * 100
                    if cumulative >= target_percent:
                        suggested_depth = depth
                        break
                print(f"   建議深度限制: {suggested_depth} (包含 {cumulative:.1f}% 的節點)")
                print(f"   如需更多細節，可試試深度 {suggested_depth + 1} 或 {suggested_depth + 2}")
                
            # 顯示 API 優化提示
            if stats['total_nodes'] > 1000:
                print(f"\n   ⚡ 效能優化:")
                print(f"   由於節點數量較多（{stats['total_nodes']} 個），建議使用深度參數減少 API 傳輸量")
                print(f"   這會在 API 層級限制資料，加快下載速度")
            
            sys.exit(0)
        
        # 下載資料
        mode_desc = '下載原始' if args.raw else '下載並精簡'
        if args.max_depth and not args.raw:
            mode_desc += f'（深度限制: {args.max_depth}）'
        print(f"\n🔄 {mode_desc} Figma 資料...")
        data = download_figma_data(file_key, node_id, api_key, args.raw, args.max_depth)
        
        # 生成檔名
        if args.name:
            filename = f"{args.name}.{args.format}"
        else:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            prefix = f"{file_key}_node-{node_id.replace(':', '-')}" if node_id else file_key
            suffix = 'raw' if args.raw else 'simplified'
            filename = f"{prefix}_{suffix}_{timestamp}.{args.format}"
        
        # 儲存檔案
        output_path = Path(args.output) / filename
        print(f"\n💾 儲存資料到: {output_path}")
        save_data(data, output_path, args.format)
        
        print(f"✅ 成功下載 Figma 資料！")
        
        # 顯示摘要
        if not args.raw and data:
            print("\n📊 資料摘要:")
            if 'name' in data:
                print(f"   名稱: {data['name']}")
            if 'type' in data:
                print(f"   類型: {data['type']}")
            if 'children' in data:
                print(f"   子元素數量: {len(data['children'])}")
            if 'width' in data and 'height' in data:
                print(f"   尺寸: {data['width']} x {data['height']}")
            
            # 精簡模式統計
            file_size = output_path.stat().st_size
            print(f"\n📦 檔案大小: {file_size / 1024:.1f} KB")
            if 'styles' in data:
                print(f"   樣式數量: {len(data['styles'])}")
            
            # 統計摘要節點
            def count_summaries(node):
                count = 0
                if node.get('type') == 'SUMMARY':
                    count = 1
                for child in node.get('children', []):
                    count += count_summaries(child)
                return count
            
            summary_count = 0
            for node in data.get('nodes', []):
                summary_count += count_summaries(node)
            
            if summary_count > 0:
                print(f"   精簡效果: 省略了重複內容（含 {summary_count} 個摘要節點）")
            
            # 統計各種元素類型
            if 'children' in data:
                type_counts = {}
                def count_types(node):
                    node_type = node.get('type', 'UNKNOWN')
                    type_counts[node_type] = type_counts.get(node_type, 0) + 1
                    for child in node.get('children', []):
                        count_types(child)
                
                count_types(data)
                if type_counts:
                    print("\n   元素類型統計:")
                    for node_type, count in sorted(type_counts.items()):
                        print(f"     {node_type}: {count}")
    
    except KeyboardInterrupt:
        print("\n\n⚠️  使用者中斷")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 錯誤: {str(e)}")
        if os.environ.get('DEBUG'):
            import traceback
            traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
# iVibeMovie API v2 Contract（冻结版）

## 1. 统一错误模型

所有失败响应统一：

```json
{
  "success": false,
  "error": {
    "code": "STRING_CODE",
    "message": "Human readable message",
    "details": {},
    "request_id": "req_xxx"
  }
}
```

## 2. 统一任务状态

- `queued`
- `processing`
- `completed`
- `failed`
- `cancelled`

## 3. 核心接口（MVP）

### 3.1 项目

1. `POST /api/v2/projects`
2. `GET /api/v2/projects/{project_id}`

### 3.2 拆分链路

1. `POST /api/v2/projects/{project_id}/episodes/split`
2. `POST /api/v2/projects/{project_id}/clips/split`
3. `POST /api/v2/projects/{project_id}/context/generate`

### 3.3 资产链路

1. `POST /api/v2/projects/{project_id}/assets/extract`
2. `POST /api/v2/projects/{project_id}/assets/generate`
3. `POST /api/v2/projects/{project_id}/assets/regenerate`
4. `POST /api/v2/projects/{project_id}/assets/redo`

### 3.4 分镜链路

1. `POST /api/v2/projects/{project_id}/storyboards/generate`
2. `PATCH /api/v2/storyboards/{storyboard_id}/panels/{panel_id}`
3. `POST /api/v2/storyboards/{storyboard_id}/panels/{panel_id}/regenerate`
4. `POST /api/v2/storyboards/{storyboard_id}/images/regenerate`

### 3.5 视频与时间轴

1. `POST /api/v2/clips/{clip_id}/videos/generate`
2. `POST /api/v2/clips/{clip_id}/videos/upload`
3. `GET /api/v2/clips/{clip_id}/videos/download`
4. `PATCH /api/v2/projects/{project_id}/timeline`
5. `POST /api/v2/projects/{project_id}/timeline/export`

### 3.6 运维

1. `GET /api/ops/queue/summary`

## 4. 输入校验规则（关键）

### 4.1 时长约束

1. `episode_duration = clip_duration * clip_count_per_episode`
2. `total_duration = episode_duration * episode_count`
3. 若超模型上限，返回 `INVALID_DURATION_CONSTRAINT`。

### 4.2 分镜约束

1. 每个 panel 必须有 `start_sec` 与 `end_sec`。
2. 每个 panel 必须包含台词/音效/语气字段。

## 5. 兼容策略

- 无兼容策略。
- 所有旧接口标记废弃并迁移到 v2。


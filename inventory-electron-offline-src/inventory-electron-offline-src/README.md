# Inventory Desktop – Offline (Electron + Vite)

Đây là **mã nguồn hoàn chỉnh** để bạn build **installer Windows (.exe, NSIS)** chạy **offline**.
Không cần cài Node trên máy của bạn — chỉ cần đẩy lên GitHub và chạy workflow.

## Cách build .exe bằng GitHub Actions (khuyến nghị)
1. Tạo repo mới trên GitHub > Upload toàn bộ thư mục này lên (giữ nguyên cấu trúc).
2. Vào tab **Actions** > chọn workflow **build-windows-offline** > **Run workflow**.
3. Sau khi chạy xong, mở run đó > **Artifacts** > tải về file installer `.exe` trong thư mục `release/`.

## Chạy thử nhanh (nếu bạn có Node trên máy dev)
```bash
npm ci
npm run dev      # mở renderer (Vite) rồi Electron sẽ tự load URL dev
npm run dist     # build renderer + tạo installer NSIS trong thư mục release/
```

## Lưu ý
- UI shadcn đã được "stub" lại nhẹ trong `src/components/ui/*` để không cần import code generator.
- App lưu **cục bộ** bằng `localStorage` và làm việc hoàn toàn **offline**.
- Nếu muốn đổi tên app/icon: chỉnh trong `package.json > build` và thêm icon vào `build/`.

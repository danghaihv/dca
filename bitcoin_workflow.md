---
description: Quy trình cập nhật báo cáo Bitcoin cho địa chỉ 3J4khZgkxF7UHeeWJvoGer5ZTPxLg2dY3j
---

# Quy Trình Cập Nhật Báo Cáo Bitcoin

## Dữ liệu đã lưu
- **File dữ liệu gốc:** `bitcoin_transactions_data.json` (trong cùng thư mục artifact)
- **File báo cáo:** `bitcoin_report.md`
- **Địa chỉ BTC:** `3J4khZgkxF7UHeeWJvoGer5ZTPxLg2dY3j`
- **Giá mua USDT:** 27,500đ / 1 USDT (hỏi lại user nếu thay đổi)

## Các bước thực hiện

### Bước 1: Đọc dữ liệu cũ
- Đọc file `bitcoin_transactions_data.json` để lấy danh sách giao dịch đã biết
- Ghi nhận số giao dịch đã có và tx_hash cuối cùng

### Bước 2: Kiểm tra giao dịch mới
- Gọi API: `https://blockchain.info/rawaddr/3J4khZgkxF7UHeeWJvoGer5ZTPxLg2dY3j`
- So sánh `n_tx` với số giao dịch đã lưu
- Nếu có giao dịch mới, trích xuất: tx_hash, date, btc_received, gas_fee (fee field)

### Bước 3: Tra giá BTC cho giao dịch mới
- Dùng CoinGecko API: `https://api.coingecko.com/api/v3/coins/bitcoin/history?date=DD-MM-YYYY`
- Nếu bị rate limit, dùng web search: "bitcoin price [date] USD historical"
- Lấy giá đóng cửa (close price) hoặc giá trung bình ngày

### Bước 4: Tính toán lại
- Chi phí USD = (BTC nhận + gas fee) × giá BTC
- Chi phí VNĐ = chi phí USD × 27,500đ (hoặc tỷ giá USDT mới nếu user thay đổi)
- Giá trung bình = Tổng USD / Tổng BTC nhận
- Cập nhật file JSON với giao dịch mới
- Cập nhật file báo cáo markdown

### Bước 5: So sánh lãi/lỗ
- Tra giá BTC hiện tại
- Tính lãi/lỗ = giá hiện tại - giá trung bình mua vào

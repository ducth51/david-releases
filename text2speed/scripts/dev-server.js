/**
 * Khởi động API server lúc dev với cổng cố định 3000.
 * Cần thiết vì biến PORT có thể đã được công cụ chạy dev đặt sẵn cho Vite.
 */
process.env.API_PORT = process.env.API_PORT || '3000'
await import('../server/index.js')

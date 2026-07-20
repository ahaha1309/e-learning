module.exports = {
  apps: [
    {
      name: 'elearning-lms',
      script: './index.js',
      instances: 'max', // Chạy trên tất cả các nhân CPU (Cluster Mode)
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Điền cấu hình Production vào đây hoặc sử dụng .env file
      }
    }
  ]
};

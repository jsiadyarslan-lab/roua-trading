import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Roua | منصة التداول',
    short_name: 'رؤى',
    description: 'منصة رؤى للتداول الذكي والتحليل العميق',
    start_url: '/',
    display: 'standalone',
    background_color: '#04050C',
    theme_color: '#0A84FF',
    orientation: 'portrait-primary',
    icons: [
      {
        src: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
      },
      {
        src: 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
      },
    ],
  }
}

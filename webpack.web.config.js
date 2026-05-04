// Web build — targets modern browsers, outputs to server/public/
// Used by Railway (npm run build:web) so the Express server can serve the
// React app as a static SPA.  The Electron build (webpack.config.js) is
// unchanged and still targets electron-renderer.

const path = require('path')

module.exports = {
  entry: './src/renderer/index.jsx',
  output: {
    path: path.resolve(__dirname, 'server/public'),
    filename: 'bundle.js',
    publicPath: '/',
  },
  target: 'web',
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              // Target last 2 major browser versions — keeps bundle compact
              ['@babel/preset-env', { targets: '> 0.5%, last 2 versions, not dead' }],
              ['@babel/preset-react', { runtime: 'automatic' }],
            ],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  // Don't polyfill Node.js built-ins — this runs in a browser
  resolve: {
    extensions: ['.js', '.jsx'],
    fallback: {
      path:   false,
      fs:     false,
      crypto: false,
    },
  },
}

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    [
      'module:react-native-dotenv',
      {
        moduleName: '@env',
        path: '.env',
        envName: 'APP_ENV',
        safe: false,
        allowUndefined: true,
      },
    ],
  ],
};

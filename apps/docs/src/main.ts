import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import App from './App.vue';
import { router } from './router';
import { vuetify } from './plugins/vuetify';
import './styles/tokens.css';
import './style.css';
import './styles/visualizations.css';

createApp(App).use(createPinia()).use(vuetify).use(router).mount('#app');

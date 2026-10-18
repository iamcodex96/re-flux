import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@mdi/font/css/materialdesignicons.css';
import 'vuetify/styles';
import App from './App.vue';
import { router } from './router';
import { vuetify } from './plugins/vuetify';
import './style.scss';
import './styles/visualizations.scss';

createApp(App).use(createPinia()).use(vuetify).use(router).mount('#app');

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@mdi/font/css/materialdesignicons.css';
import App from './App.vue';
import { router } from './router';
import { UiComponents } from './components/ui/UiPrimitives';
import './styles/main.scss';

const app = createApp(App);
for (const [name, component] of Object.entries(UiComponents)) {
  app.component(name, component);
}

app.use(createPinia()).use(router).mount('#app');

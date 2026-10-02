import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createHashRouter, Outlet, RouterProvider } from 'react-router'
import { Sidebar } from './components/Sidebar'
import Chat from './screens/Chat'
import Home from './screens/Home'
import Import from './screens/Import'
import Review from './screens/Review'
import Settings from './screens/Settings'
import Weak from './screens/Weak'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } }
})

function Layout(): React.JSX.Element {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

// Hash routing because the packaged app loads index.html from file://.
const router = createHashRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: 'review', Component: Review },
      { path: 'chat', Component: Chat },
      { path: 'weak', Component: Weak },
      { path: 'import', Component: Import },
      { path: 'settings', Component: Settings }
    ]
  }
])

export default function App(): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

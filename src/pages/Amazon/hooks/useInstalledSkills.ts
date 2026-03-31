import { useState, useEffect } from 'react'
import { invokeIpc } from '@/lib/api-client'
import type { SkillMeta } from '../amazonSettingsStore'

export function useInstalledSkills() {
  const [skills, setSkills] = useState<SkillMeta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    invokeIpc<{ success: boolean; skills: SkillMeta[] }>('amazon:listUserSkills')
      .then((r) => { if (r?.success) setSkills(r.skills) })
      .finally(() => setLoading(false))
  }, [])

  return { skills, loading }
}

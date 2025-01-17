import {SubscriptionChannel} from 'parabol-client/types/constEnums'
import getRethink from '../../../database/rethinkDriver'
import MeetingSettingsRetrospective from '../../../database/types/MeetingSettingsRetrospective'
import RetroMeetingMember from '../../../database/types/RetroMeetingMember'
import updateMeetingTemplateLastUsedAt from '../../../postgres/queries/updateMeetingTemplateLastUsedAt'
import updateTeamByTeamId from '../../../postgres/queries/updateTeamByTeamId'
import {MeetingTypeEnum} from '../../../postgres/types/Meeting'
import {analytics} from '../../../utils/analytics/analytics'
import {getUserId, isTeamMember} from '../../../utils/authorization'
import publish from '../../../utils/publish'
import standardError from '../../../utils/standardError'
import {MutationResolvers} from '../resolverTypes'
import createGcalEvent from '../../mutations/helpers/createGcalEvent'
import isStartMeetingLocked from '../../mutations/helpers/isStartMeetingLocked'
import {IntegrationNotifier} from '../../mutations/helpers/notifications/IntegrationNotifier'
import safeCreateRetrospective from '../../mutations/helpers/safeCreateRetrospective'

const startRetrospective: MutationResolvers['startRetrospective'] = async (
  _source,
  {teamId, gcalInput},
  {authToken, socketId: mutatorId, dataLoader}
) => {
  const r = await getRethink()
  const operationId = dataLoader.share()
  const subOptions = {mutatorId, operationId}
  const DUPLICATE_THRESHOLD = 3000
  // AUTH
  const viewerId = getUserId(authToken)
  if (!isTeamMember(authToken, teamId)) {
    return standardError(new Error('User not on team'), {userId: viewerId})
  }
  const unpaidError = await isStartMeetingLocked(teamId, dataLoader)
  if (unpaidError) return standardError(new Error(unpaidError), {userId: viewerId})

  // RESOLUTION
  const viewer = await dataLoader.get('users').loadNonNull(viewerId)

  const meetingType: MeetingTypeEnum = 'retrospective'
  const meetingSettings = (await dataLoader
    .get('meetingSettingsByType')
    .load({teamId, meetingType})) as MeetingSettingsRetrospective

  const {
    id: meetingSettingsId,
    totalVotes,
    maxVotesPerGroup,
    selectedTemplateId,
    disableAnonymity,
    videoMeetingURL
  } = meetingSettings

  const meeting = await safeCreateRetrospective(
    {
      teamId,
      facilitatorUserId: viewerId,
      totalVotes,
      maxVotesPerGroup,
      disableAnonymity,
      templateId: selectedTemplateId,
      videoMeetingURL: videoMeetingURL ?? undefined
    },
    dataLoader
  )
  const meetingId = meeting.id

  const template = await dataLoader.get('meetingTemplates').load(selectedTemplateId)
  await Promise.all([
    r.table('NewMeeting').insert(meeting).run(),
    updateMeetingTemplateLastUsedAt(selectedTemplateId, teamId)
  ])

  // Disallow accidental starts (2 meetings within 2 seconds)
  const newActiveMeetings = await dataLoader.get('activeMeetingsByTeamId').load(teamId)
  const otherActiveMeeting = newActiveMeetings.find((activeMeeting) => {
    const {createdAt, id} = activeMeeting
    if (id === meetingId || activeMeeting.meetingType !== meetingType) return false
    return createdAt.getTime() > Date.now() - DUPLICATE_THRESHOLD
  })
  if (otherActiveMeeting) {
    await r.table('NewMeeting').get(meetingId).delete().run()
    return {error: {message: 'Meeting already started'}}
  }

  const updates = {
    lastMeetingType: meetingType
  }
  await Promise.all([
    r
      .table('MeetingMember')
      .insert(
        new RetroMeetingMember({meetingId, userId: viewerId, teamId, votesRemaining: totalVotes})
      )
      .run(),
    updateTeamByTeamId(updates, teamId),
    videoMeetingURL &&
      r
        .table('MeetingSettings')
        .get(meetingSettingsId)
        .update({
          videoMeetingURL: null
        })
        .run()
  ])
  IntegrationNotifier.startMeeting(dataLoader, meetingId, teamId)
  analytics.meetingStarted(viewer, meeting, template)
  const {error} = await createGcalEvent({gcalInput, meetingId, teamId, viewerId, dataLoader})
  const data = {teamId, meetingId, hasGcalError: !!error?.message}
  publish(SubscriptionChannel.TEAM, teamId, 'StartRetrospectiveSuccess', data, subOptions)
  return data
}

export default startRetrospective

export const GLOBAL_INTENTS = {
  emergency: ['emergency','pain','bleeding','swelling','accident','urgent',
              'toothache','abscess','fracture','knocked out','severe','hurts','broken tooth','injury'],
  cancel:    ['cancel','forget it','abort','nevermind','never mind'],
  main_menu: ['0','menu','home','start over','restart','main menu','back to menu'],
  escalate:  ['agent','human','talk to','representative','speak to','person'],
  back:      ['back','previous','go back','return'],
  greeting:  ['hi','hello','hey','namaste','good morning','good afternoon','good evening'],
  thanks:    ['thanks','thank you','thx','ty','appreciate'],
  help:      ['help','?','what can you do'],
};

export const STATE_INTENTS = {
  MAIN_MENU:            { appointment: ['1','book','appointment','book appointment','schedule a visit','booking','schedule'],
                          services:    ['2','services','dental services','treatment','procedures','what we offer','what do you do'],
                          location:    ['3','location','clinic location','address','directions','where'],
                          timings:     ['4','timings','clinic timings','hours','open','close','schedule'],
                          my_appointments: ['5','my appointments','my bookings','upcoming appointments','appointments','cancel my appointment',"reschedule","manage appointment"],
                          callback:    ['callback','call back','call me back','ring me'] },
  BOOKING_CONFIRMATION: { confirm:    ['confirm','correct','book it','done','proceed','yes','go ahead'],
                          edit_date:  ['change date','different date','date'],
                          edit_time:  ['change time','different time','time'] },
  BOOKED:               { appointment: ['book another','book','1'],
                          main_menu:   ['menu','0','done'],
                          cancel_appointment: ['cancel appointment','cancel this','cancel my appointment'],
                          reschedule: ['reschedule','change appointment','change date','change time','rebook'] },
  CANCEL_CONFIRM:       { confirm_cancel: ['yes','confirm','cancel it','yes cancel'],
                          back:         ['no','keep','back','dont cancel'] },
};
